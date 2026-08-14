import { AiCollaborationError } from '../errors/ai-collaboration-error'
import {
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

const reviewPackage = {
  objectVersion: 2,
  confirmationUnit: 'basic_info_draft' as const,
  candidates: [
    {
      fieldKey: 'name' as const,
      proposedValue: '八月川西团',
      clarity: 'clear' as const,
      evidence: [{ kind: 'user_message' as const, excerpt: '团名叫八月川西团' }],
    },
  ],
}

describe('headless Agent execution contract', () => {
  it('requires task, conversation, input batch, attempt and context manifest identities', () => {
    expect(
      headlessExecutionRequestSchema.parse({
        ...identity,
        runId: 'legacy-run',
        messages: ['must not become execution identity'],
      }),
    ).toEqual(identity)

    expect(() =>
      headlessExecutionRequestSchema.parse({
        taskId: 'task-1',
        attemptId: 'attempt-1',
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
        question: '出团日期是哪一天？',
      }),
    ).toEqual({
      kind: 'awaiting_user_input',
      question: '出团日期是哪一天？',
    })

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
})
