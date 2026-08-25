import { AiCollaborationError } from '../errors/ai-collaboration-error'
import {
  diagnosticFromResult,
  headlessExecutionRequestSchema,
  headlessExecutionResultSchema,
} from './headless-execution'

const identity = {
  taskId: 'task-1',
  conversationId: 'conversation-1',
  inputBatchId: 'batch-1',
  attemptId: 'attempt-1',
  contextManifestId: 'manifest-1',
}

const userTextSha256 = 'a'.repeat(64)

const reviewPackage = {
  objectVersion: 2,
  confirmationUnit: 'basic_info_draft' as const,
  candidates: [
    {
      fieldKey: 'name' as const,
      proposedValue: '八月川西团',
      clarity: 'clear' as const,
      evidence: [{ kind: 'user_message' as const, sequence: 1, excerpt: '团名叫八月川西团' }],
    },
  ],
}

describe('headless Agent execution contract', () => {
  it('requires conversation, input batch, attempt and context manifest identities', () => {
    expect(
      headlessExecutionRequestSchema.parse({
        ...identity,
        userText: '帮我建一个喀纳斯3日团',
        userTextSha256,
        runId: 'legacy-run',
        messages: ['must not become execution identity'],
      }),
    ).toEqual({
      ...identity,
      userText: '帮我建一个喀纳斯3日团',
      userTextSha256,
    })

    expect(
      headlessExecutionRequestSchema.parse({
        conversationId: identity.conversationId,
        inputBatchId: identity.inputBatchId,
        attemptId: identity.attemptId,
        contextManifestId: identity.contextManifestId,
        userText: '今天合作伙伴账款怎么查？',
        userTextSha256,
      }),
    ).toEqual({
      conversationId: identity.conversationId,
      inputBatchId: identity.inputBatchId,
      attemptId: identity.attemptId,
      contextManifestId: identity.contextManifestId,
      userText: '今天合作伙伴账款怎么查？',
      userTextSha256,
    })

    expect(() =>
      headlessExecutionRequestSchema.parse({
        taskId: 'task-1',
        attemptId: 'attempt-1',
      }),
    ).toThrow()
  })

  it('requires the assembled User plaintext in addition to execution identity', () => {
    expect(() => headlessExecutionRequestSchema.parse(identity)).toThrow()
    expect(
      headlessExecutionRequestSchema.parse({
        ...identity,
        userText: '  帮我建一个喀纳斯3日团  ',
        userTextSha256,
      }),
    ).toEqual({
      ...identity,
      userText: '帮我建一个喀纳斯3日团',
      userTextSha256,
    })
  })

  it('requires the Manifest hash of the assembled User message', () => {
    expect(() =>
      headlessExecutionRequestSchema.parse({
        ...identity,
        userText: '帮我建一个喀纳斯3日团',
      }),
    ).toThrow()
    expect(() =>
      headlessExecutionRequestSchema.parse({
        ...identity,
        userText: '帮我建一个喀纳斯3日团',
        userTextSha256: 'not-a-digest',
      }),
    ).toThrow()
  })

  it('accepts only structured terminal outcomes and rejects model prose as a status', () => {
    expect(
      headlessExecutionResultSchema.parse({
        kind: 'completed',
        message: '已根据当前资料整理出团基础信息。',
        extra: 'strip',
      }),
    ).toEqual({
      kind: 'completed',
      message: '已根据当前资料整理出团基础信息。',
    })

    expect(
      headlessExecutionResultSchema.parse({
        kind: 'awaiting_user_input',
        interaction: { type: 'free_text', prompt: '出团日期是哪一天？' },
      }),
    ).toEqual({
      kind: 'awaiting_user_input',
      interaction: { type: 'free_text', prompt: '出团日期是哪一天？' },
    })

    expect(
      headlessExecutionResultSchema.parse({
        kind: 'awaiting_user_input',
        interaction: {
          type: 'single_choice',
          prompt: '出团几天？',
          options: [
            { id: '3d', label: '3天' },
            { id: '5d', label: '5天' },
          ],
        },
      }),
    ).toMatchObject({
      kind: 'awaiting_user_input',
      interaction: { type: 'single_choice', prompt: '出团几天？' },
    })

    expect(() =>
      headlessExecutionResultSchema.parse({
        kind: 'awaiting_user_input',
        question: '出团日期是哪一天？',
      }),
    ).toThrow()

    expect(() =>
      headlessExecutionResultSchema.parse({
        kind: 'awaiting_user_input',
        interaction: { type: 'single_choice', prompt: '出团几天？' },
      }),
    ).toThrow()

    expect(
      headlessExecutionResultSchema.parse({
        kind: 'awaiting_review',
        reviewPackage,
      }),
    ).toMatchObject({
      kind: 'awaiting_review',
      reviewPackage: { objectVersion: 2, confirmationUnit: 'basic_info_draft' },
    })

    expect(
      headlessExecutionResultSchema.parse({
        kind: 'failed',
        error: AiCollaborationError.fromCode('PERMISSION_DENIED').toJSON(),
      }),
    ).toEqual({
      kind: 'failed',
      error: {
        code: 'PERMISSION_DENIED',
        message: '当前账号无权使用 AI 建团辅助',
        retryable: false,
      },
    })

    expect(() =>
      headlessExecutionResultSchema.parse({
        kind: 'completed',
        text: '模型说已经问完了',
      }),
    ).toThrow()

    expect(() =>
      headlessExecutionResultSchema.parse({
        status: 'waiting for user',
        message: '出团日期是哪一天？',
      }),
    ).toThrow()
  })

  it('treats omitted diagnostic as missing usage and never invents provider tokens', () => {
    expect(
      diagnosticFromResult(
        headlessExecutionResultSchema.parse({
          kind: 'completed',
          message: '已根据当前资料整理出团基础信息。',
        }),
      ),
    ).toEqual({
      usageSource: 'missing',
      toolSteps: [],
    })
  })

  it('accepts optional diagnostic and distinguishes missing, estimated and actual usage', () => {
    expect(
      headlessExecutionResultSchema.parse({
        kind: 'completed',
        message: '已根据当前资料整理出团基础信息。',
        diagnostic: {
          mastraTraceId: 'trace-1',
          usageSource: 'actual',
          usage: { input: 120, output: 40, total: 160 },
          latencyMs: 850,
          toolSteps: [
            {
              stepId: 'step-1',
              toolName: 'getTaskContext',
              capabilityKey: 'departure.task-context.read',
              capabilityVersion: 2,
              status: 'succeeded',
              latencyMs: 40,
            },
          ],
        },
      }),
    ).toMatchObject({
      diagnostic: {
        mastraTraceId: 'trace-1',
        usageSource: 'actual',
        usage: { input: 120, output: 40, total: 160 },
        latencyMs: 850,
      },
    })

    expect(
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
              toolName: 'submitReviewPackage',
              status: 'schema_rejected',
              errorCode: 'INVALID_FORMAT',
            },
          ],
        },
      }).diagnostic,
    ).toMatchObject({ usageSource: 'estimated', usage: { total: 90 } })

    expect(() =>
      headlessExecutionResultSchema.parse({
        kind: 'completed',
        message: 'ok',
        diagnostic: { usageSource: 'actual' },
      }),
    ).toThrow()

    expect(() =>
      headlessExecutionResultSchema.parse({
        kind: 'completed',
        message: 'ok',
        diagnostic: { usageSource: 'missing', usage: { total: 10 } },
      }),
    ).toThrow()
  })
})
