import { AiCollaborationError } from '../errors/ai-collaboration-error'
import {
  attemptDiagnosticPersist,
  attemptRecoveryJudgment,
  diagnosticFromResult,
  headlessExecutionResultSchema,
} from './headless-execution'

describe('Attempt diagnostic persist', () => {
  it('projects omitted diagnostic as missing usage without inventing tokens', () => {
    const result = headlessExecutionResultSchema.parse({
      kind: 'answered',
      message: '已记下当前说明。',
      completionBasis: { kind: 'final_answer' },
    })

    expect(attemptDiagnosticPersist(result)).toEqual({
      mastraTraceId: null,
      processorVersion: null,
      usageSource: 'missing',
      usage: null,
      latencyMs: null,
      errorCode: null,
      toolSteps: [],
      modelSteps: [],
    })
    expect(diagnosticFromResult(result).usage).toBeUndefined()
  })

  it('keeps estimated and actual usage distinguishable on the Attempt record', () => {
    expect(
      attemptDiagnosticPersist(
        headlessExecutionResultSchema.parse({
          kind: 'answered',
          message: 'ok',
          completionBasis: { kind: 'final_answer' },
          diagnostic: {
            mastraTraceId: 'trace-actual',
            usageSource: 'actual',
            usage: { input: 80, output: 20, total: 100 },
            latencyMs: 640,
            toolSteps: [
              {
                stepId: 'step-1',
                toolName: 'getTaskContext',
                capabilityKey: 'departure.task-context.read',
                capabilityVersion: 2,
                status: 'succeeded',
                latencyMs: 32,
              },
            ],
          },
        }),
      ),
    ).toEqual({
      mastraTraceId: 'trace-actual',
      processorVersion: null,
      usageSource: 'actual',
      usage: { input: 80, output: 20, total: 100 },
      latencyMs: 640,
      errorCode: null,
      toolSteps: [
        {
          stepId: 'step-1',
          toolName: 'getTaskContext',
          capabilityKey: 'departure.task-context.read',
          capabilityVersion: 2,
          status: 'succeeded',
          latencyMs: 32,
        },
      ],
      modelSteps: [],
    })

    expect(
      attemptDiagnosticPersist(
        headlessExecutionResultSchema.parse({
          kind: 'failed',
          error: AiCollaborationError.fromCode('INVALID_FORMAT').toJSON(),
          diagnostic: {
            usageSource: 'estimated',
            usage: { total: 90 },
            errorCode: 'INVALID_FORMAT',
            toolSteps: [
              {
                stepId: 'step-1',
                toolName: 'proposeReviewPackage',
                status: 'schema_rejected',
                errorCode: 'INVALID_FORMAT',
              },
            ],
          },
        }),
      ),
    ).toMatchObject({
      mastraTraceId: null,
      usageSource: 'estimated',
      usage: { total: 90 },
      errorCode: 'INVALID_FORMAT',
    })
  })

  it('judges recovery from PostgreSQL Attempt fields even after Mastra trace is deleted', () => {
    const persisted = attemptDiagnosticPersist(
      headlessExecutionResultSchema.parse({
        kind: 'answered',
        message: '已完成。',
        completionBasis: { kind: 'final_answer' },
        diagnostic: { mastraTraceId: 'trace-to-drop', usageSource: 'missing' },
      }),
    )

    expect(
      attemptRecoveryJudgment({
        status: 'completed',
        errorCode: null,
        resultKind: 'answered',
        mastraTraceId: persisted.mastraTraceId,
      }),
    ).toEqual({ recoverable: true, status: 'completed', errorCode: null })

    expect(
      attemptRecoveryJudgment({
        status: 'completed',
        errorCode: null,
        resultKind: 'answered',
        mastraTraceId: null,
      }),
    ).toEqual({ recoverable: true, status: 'completed', errorCode: null })

    expect(
      attemptRecoveryJudgment({
        status: 'failed',
        errorCode: 'AGENT_UNAVAILABLE',
        resultKind: 'failed',
        mastraTraceId: null,
      }),
    ).toEqual({ recoverable: true, status: 'failed', errorCode: 'AGENT_UNAVAILABLE' })
  })
})
