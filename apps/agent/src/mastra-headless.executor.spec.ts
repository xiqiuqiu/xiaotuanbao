import { AiCollaborationError } from '@xiaotuanbao/ai-contracts'
import { createMastraHeadlessExecutor } from './mastra-headless.executor'

const IDENTITY = {
  taskId: 'task-1',
  conversationId: 'conversation-1',
  inputBatchId: 'batch-1',
  attemptId: 'attempt-1',
  contextManifestId: 'manifest-1',
  userText: '帮我建一个喀纳斯3日团',
  userTextSha256: 'a'.repeat(64),
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
      diagnostic: { usageSource: 'missing', toolSteps: [] },
    })
  })

  it('returns awaiting_review only after proposeReviewPackage is accepted', async () => {
    const executor = createMastraHeadlessExecutor({
      readUserText: async () => '帮我建一个喀纳斯3日团',
      generate: async () => ({
        text: '已提交待审核建议。',
        toolCalls: [{ toolName: 'proposeReviewPackage', args: REVIEW_ARGS }],
        toolResults: [
          {
            type: 'tool-result',
            payload: {
              toolName: 'proposeReviewPackage',
              result: {
                status: 'accepted',
                objectVersion: REVIEW_ARGS.objectVersion,
                confirmationUnit: REVIEW_ARGS.confirmationUnit,
                candidates: REVIEW_ARGS.candidates,
                normalizedProposal: {
                  schemaVersion: 1,
                  normalizationVersion: 'unicode-nfc-whitespace-v1',
                  policyVersion: 'evidence-authenticity-v1',
                  candidates: [
                    {
                      candidateIndex: 0,
                      candidateId: 'routeName',
                      proposedValue: '喀纳斯3日线',
                      evidenceIds: ['e1'],
                    },
                  ],
                  evidenceCatalog: [],
                },
              },
            },
          },
        ],
      }),
    })

    await expect(executor(IDENTITY)).resolves.toEqual({
      kind: 'awaiting_review',
      reviewPackage: REVIEW_ARGS,
      diagnostic: {
        usageSource: 'missing',
        toolSteps: [
          {
            stepId: 'tool-1',
            toolName: 'proposeReviewPackage',
            capabilityKey: 'departure.review-package.propose',
            capabilityVersion: 1,
            status: 'succeeded',
          },
        ],
      },
    })
  })

  it('stays in the current attempt when proposeReviewPackage is rejected', async () => {
    const executor = createMastraHeadlessExecutor({
      readUserText: async () => '帮我建一个喀纳斯3日团',
      generate: async () => ({
        text: '摘录对不上冻结消息，请修正后再提。',
        toolCalls: [{ toolName: 'proposeReviewPackage', args: REVIEW_ARGS }],
        toolResults: [
          {
            toolName: 'proposeReviewPackage',
            result: {
              status: 'rejected',
              errors: [
                {
                  candidateIndex: 0,
                  evidenceIndex: 0,
                  code: 'EXCERPT_NOT_FOUND',
                  message: '摘录对不上冻结消息',
                },
              ],
            },
          },
        ],
      }),
    })

    await expect(executor(IDENTITY)).resolves.toEqual({
      kind: 'completed',
      message: '摘录对不上冻结消息，请修正后再提。',
      diagnostic: {
        usageSource: 'missing',
        toolSteps: [
          {
            stepId: 'tool-1',
            toolName: 'proposeReviewPackage',
            capabilityKey: 'departure.review-package.propose',
            capabilityVersion: 1,
            status: 'succeeded',
          },
        ],
      },
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
      diagnostic: {
        usageSource: 'missing',
        errorCode: 'MODEL_TIMEOUT',
        toolSteps: [],
      },
    })
  })
})
