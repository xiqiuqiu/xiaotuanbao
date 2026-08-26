import { Prisma } from '@prisma/client'
import { AiCollaborationError } from '@xiaotuanbao/ai-contracts'
import { attemptDiagnosticUpdate, manifestUsageUpdate, recoveryFromAttempt } from './attempt-diagnostic'

describe('Attempt diagnostic persist', () => {
  it('defaults omitted diagnostic to missing usage without inventing tokens', () => {
    expect(
      attemptDiagnosticUpdate({
        kind: 'completed',
        message: '已记下当前说明。',
      }),
    ).toEqual({
      mastraTraceId: null,
      usageSource: 'missing',
      usage: Prisma.DbNull,
      latencyMs: null,
      toolSteps: [],
    })
  })

  it('keeps estimated and actual usage distinguishable', () => {
    expect(
      attemptDiagnosticUpdate({
        kind: 'completed',
        message: 'ok',
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
          modelSteps: [],
        },
      }),
    ).toMatchObject({
      mastraTraceId: 'trace-actual',
      usageSource: 'actual',
      usage: { input: 80, output: 20, total: 100 },
      latencyMs: 640,
    })

    expect(
      attemptDiagnosticUpdate({
        kind: 'failed',
        error: AiCollaborationError.fromCode('INVALID_FORMAT').toJSON(),
        diagnostic: {
          usageSource: 'estimated',
          usage: { total: 90 },
          errorCode: 'INVALID_FORMAT',
          toolSteps: [],
          modelSteps: [],
        },
      }),
    ).toMatchObject({
      usageSource: 'estimated',
      usage: { total: 90 },
      errorCode: 'INVALID_FORMAT',
    })
  })

  it('judges recovery from PostgreSQL fields after Mastra trace deletion', () => {
    const completed = {
      status: 'completed' as const,
      errorCode: null,
      resultJson: { kind: 'completed', message: '已完成。' },
      mastraTraceId: 'trace-to-drop',
    }
    expect(recoveryFromAttempt(completed)).toEqual({
      recoverable: true,
      status: 'completed',
      errorCode: null,
    })
    expect(recoveryFromAttempt({ ...completed, mastraTraceId: null })).toEqual({
      recoverable: true,
      status: 'completed',
      errorCode: null,
    })
  })

  it('copies provider usage onto the Context Manifest without forging actual tokens', () => {
    expect(
      manifestUsageUpdate({
        kind: 'completed',
        message: 'ok',
        diagnostic: {
          processorVersion: 'mastra-token-limiter-contiguous/v1',
          usageSource: 'actual',
          usage: { input: 80, output: 20, total: 100 },
          toolSteps: [],
          modelSteps: [
            { stepIndex: 0, usageSource: 'actual', usage: { input: 40, output: 8, total: 48 } },
            { stepIndex: 1, usageSource: 'actual', usage: { input: 40, output: 12, total: 52 } },
          ],
        },
      }),
    ).toEqual({
      processorVersion: 'mastra-token-limiter-contiguous/v1',
      usageSource: 'actual',
      usage: { input: 80, output: 20, total: 100 },
      stepUsages: [
        { stepIndex: 0, usageSource: 'actual', usage: { input: 40, output: 8, total: 48 } },
        { stepIndex: 1, usageSource: 'actual', usage: { input: 40, output: 12, total: 52 } },
      ],
    })

    expect(manifestUsageUpdate()).toEqual({
      usageSource: 'missing',
      usage: Prisma.DbNull,
      stepUsages: [],
    })
    expect(manifestUsageUpdate()).not.toHaveProperty('processorVersion')
  })
})
