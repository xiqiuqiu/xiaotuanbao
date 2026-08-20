import { AiCollaborationError } from '@xiaotuanbao/ai-contracts'
import { createMastraHeadlessExecutor } from './mastra-headless.executor'

const IDENTITY = {
  taskId: 'task-1',
  conversationId: 'conversation-1',
  inputBatchId: 'batch-1',
  attemptId: 'attempt-1',
  contextManifestId: 'manifest-1',
  userText: '帮我建一个喀纳斯3日团',
}

const REVIEW_ARGS = {
  objectVersion: 2,
  confirmationUnit: 'basic_info_draft' as const,
  candidates: [
    {
      fieldKey: 'routeName' as const,
      proposedValue: '喀纳斯3日线',
      clarity: 'clear' as const,
      evidence: [{ kind: 'user_message' as const, sequence: 1, excerpt: '帮我建一个喀纳斯3日团' }],
    },
  ],
}

describe('createMastraHeadlessExecutor', () => {
  it('passes the Worker User plaintext from the headless request into generate', async () => {
    const executor = createMastraHeadlessExecutor({
      readUserText: async (request) => request.userText,
      generate: async (userText) => {
        expect(userText).toBe('帮我建一个喀纳斯3日团')
        return { text: '已记下喀纳斯三日团的说明，请在表单核对路线和日期。', toolCalls: [] }
      },
    })

    await expect(executor(IDENTITY)).resolves.toEqual({
      kind: 'completed',
      message: '已记下喀纳斯三日团的说明，请在表单核对路线和日期。',
    })
  })

  it('returns awaiting_review when submitReviewPackage was called', async () => {
    const executor = createMastraHeadlessExecutor({
      readUserText: async () => '帮我建一个喀纳斯3日团',
      generate: async () => ({
        text: '已提交待审核建议。',
        toolCalls: [{ toolName: 'submitReviewPackage', args: REVIEW_ARGS }],
      }),
    })

    await expect(executor(IDENTITY)).resolves.toEqual({
      kind: 'awaiting_review',
      reviewPackage: REVIEW_ARGS,
    })
  })

  it('maps model failures to a structured failed outcome', async () => {
    const executor = createMastraHeadlessExecutor({
      readUserText: async () => '帮我建一个喀纳斯3日团',
      generate: async () => {
        throw new Error('model timeout')
      },
    })

    await expect(executor(IDENTITY)).resolves.toEqual({
      kind: 'failed',
      error: AiCollaborationError.fromCode('MODEL_TIMEOUT').toJSON(),
    })
  })
})
