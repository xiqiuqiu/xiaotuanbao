import { AiCollaborationError } from '@xiaotuanbao/ai-contracts'
import { collectHeadlessRun } from './headless-execution'
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
  it('returns only the registered departure intent from an accepted bounded routing result', async () => {
    const executor = createMastraHeadlessExecutor({
      readUserText: async () => '帮我建一个七月喀纳斯团',
      generate: async () => ({
        text: '正在准备建团任务。',
        toolCalls: [{ toolName: 'routeConversation' }],
        toolResults: [
          {
            toolName: 'routeConversation',
            result: {
              status: 'accepted',
              decision: 'propose_departure_creation',
              registeredIntent: {
                key: 'task.departure-creation.requested',
                confidence: 'high',
                goal: '创建七月喀纳斯团',
              },
            },
          },
        ],
      }),
    })

    await expect(collectHeadlessRun(executor(IDENTITY))).resolves.toMatchObject({
      result: {
        kind: 'registered_intent',
        intent: {
          key: 'task.departure-creation.requested',
          confidence: 'high',
          goal: '创建七月喀纳斯团',
        },
      },
    })
  })

  it('turns an accepted ambiguous routing result into a persistent clarification outcome', async () => {
    const executor = createMastraHeadlessExecutor({
      readUserText: async () => '帮我处理一下发团',
      generate: async () => ({
        text: '需要确认你的目标。',
        toolCalls: [{ toolName: 'routeConversation' }],
        toolResults: [
          {
            payload: {
              toolName: 'routeConversation',
              result: {
                status: 'accepted',
                decision: 'request_clarification',
                interaction: {
                  type: 'free_text',
                  prompt: '你希望新建发团，还是查询已有发团？',
                },
              },
            },
          },
        ],
      }),
    })

    await expect(collectHeadlessRun(executor(IDENTITY))).resolves.toMatchObject({
      result: {
        kind: 'awaiting_user_input',
        interaction: {
          type: 'free_text',
          prompt: '你希望新建发团，还是查询已有发团？',
        },
      },
    })
  })

  it('passes the Worker User plaintext from the headless request into generate', async () => {
    const executor = createMastraHeadlessExecutor({
      readUserText: async (request) => request.userText,
      generate: async (userText) => {
        expect(userText).toBe('帮我建一个喀纳斯3日团')
        return { text: '已记下喀纳斯三日团的说明，请在表单核对路线和日期。', toolCalls: [] }
      },
    })

    await expect(collectHeadlessRun(executor(IDENTITY))).resolves.toMatchObject({
      result: {
        kind: 'completed',
        message: '已记下喀纳斯三日团的说明，请在表单核对路线和日期。',
        diagnostic: {
          processorVersion: 'mastra-token-limiter-contiguous/v1',
          usageSource: 'missing',
          toolSteps: [],
          modelSteps: [],
        },
      },
    })
  })

  it('maps public text-delta chunks to message.delta and never emits tool args', async () => {
    const executor = createMastraHeadlessExecutor({
      readUserText: async () => '帮我建一个喀纳斯3日团',
      stream: async () => ({
        fullStream: (async function* () {
          yield { type: 'reasoning-delta', payload: { text: '先核对出团日期' } }
          yield { type: 'text-delta', payload: { text: '已' } }
          yield {
            type: 'tool-call-delta',
            payload: { toolName: 'proposeReviewPackage', argsTextDelta: '{"secret":1}' },
          }
          yield { type: 'text-delta', payload: { text: '记下喀纳斯三日团。' } }
        })(),
        getFullOutput: async () => ({
          text: '已记下喀纳斯三日团。',
          toolCalls: [{ toolName: 'proposeReviewPackage', args: REVIEW_ARGS }],
        }),
      }),
    })

    const { frames, result } = await collectHeadlessRun(executor(IDENTITY))
    expect(frames.map((frame) => frame.type)).toEqual([
      'run.started',
      'reasoning.delta',
      'message.delta',
      'message.delta',
      'run.completed',
    ])
    expect(frames.filter((frame) => frame.type === 'reasoning.delta')).toEqual([
      { type: 'reasoning.delta', sequence: 1, text: '先核对出团日期' },
    ])
    expect(frames.filter((frame) => frame.type === 'message.delta')).toEqual([
      { type: 'message.delta', sequence: 2, text: '已' },
      { type: 'message.delta', sequence: 3, text: '记下喀纳斯三日团。' },
    ])
    expect(JSON.stringify(frames.filter((frame) => frame.type === 'message.delta'))).not.toContain(
      '先核对出团日期',
    )
    expect(JSON.stringify(frames)).not.toContain('secret')
    expect(result).toMatchObject({
      kind: 'completed',
      message: '已记下喀纳斯三日团。',
    })
  })

  it('overwrites previous-step reasoning and keeps public reply accumulating', async () => {
    const executor = createMastraHeadlessExecutor({
      readUserText: async () => '帮我建一个喀纳斯3日团',
      stream: async () => ({
        fullStream: (async function* () {
          yield { type: 'reasoning-delta', payload: { text: '第一段思考' } }
          yield { type: 'text-delta', payload: { text: '已记下路线。' } }
          yield { type: 'step-finish' }
          yield { type: 'reasoning-delta', payload: { text: '第二段思考' } }
          yield { type: 'text-delta', payload: { text: '日期待核对。' } }
        })(),
        getFullOutput: async () => ({
          text: '已记下路线。日期待核对。',
          toolCalls: [],
        }),
      }),
    })

    const { frames } = await collectHeadlessRun(executor(IDENTITY))
    const reasoning = frames.filter((frame) => frame.type === 'reasoning.delta')
    const messages = frames.filter((frame) => frame.type === 'message.delta')
    expect(reasoning.map((frame) => frame.text)).toEqual(['第一段思考', '第二段思考'])
    expect(messages.map((frame) => frame.text)).toEqual(['已记下路线。', '日期待核对。'])
    expect(frames.some((frame) => frame.type === 'run.heartbeat')).toBe(false)
  })

  it('accumulates reasoning.delta within one model step', async () => {
    const executor = createMastraHeadlessExecutor({
      readUserText: async () => '帮我建一个喀纳斯3日团',
      stream: async () => ({
        fullStream: (async function* () {
          yield { type: 'reasoning-delta', payload: { text: '先核对' } }
          yield { type: 'reasoning-delta', payload: { text: '日期' } }
          yield { type: 'text-delta', payload: { text: '已记下。' } }
        })(),
        getFullOutput: async () => ({ text: '已记下。', toolCalls: [] }),
      }),
    })

    const { frames } = await collectHeadlessRun(executor(IDENTITY))
    expect(frames.filter((frame) => frame.type === 'reasoning.delta')).toEqual([
      { type: 'reasoning.delta', sequence: 1, text: '先核对' },
      { type: 'reasoning.delta', sequence: 2, text: '先核对日期' },
    ])
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

    await expect(collectHeadlessRun(executor(IDENTITY))).resolves.toMatchObject({
      result: {
        kind: 'awaiting_review',
        reviewPackage: REVIEW_ARGS,
        diagnostic: {
          processorVersion: 'mastra-token-limiter-contiguous/v1',
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
          modelSteps: [],
        },
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

    await expect(collectHeadlessRun(executor(IDENTITY))).resolves.toMatchObject({
      result: {
        kind: 'completed',
        message: '摘录对不上冻结消息，请修正后再提。',
        diagnostic: {
          processorVersion: 'mastra-token-limiter-contiguous/v1',
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
          modelSteps: [],
        },
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

    await expect(collectHeadlessRun(executor(IDENTITY))).resolves.toMatchObject({
      result: {
        kind: 'failed',
        error: AiCollaborationError.fromCode('MODEL_TIMEOUT').toJSON(),
        diagnostic: {
          processorVersion: 'mastra-token-limiter-contiguous/v1',
          usageSource: 'missing',
          errorCode: 'MODEL_TIMEOUT',
          toolSteps: [],
          modelSteps: [],
        },
      },
    })
  })

  it('associates provider usage with the Attempt diagnostic and keeps estimates distinct', async () => {
    const withActual = createMastraHeadlessExecutor({
      readUserText: async () => '帮我建一个喀纳斯3日团',
      generate: async () => ({
        text: '已记下。',
        totalUsage: { inputTokens: 80, outputTokens: 20, totalTokens: 100 },
        steps: [
          { usage: { inputTokens: 40, outputTokens: 8, totalTokens: 48 } },
          { usage: { inputTokens: 40, outputTokens: 12, totalTokens: 52 } },
        ],
      }),
    })
    await expect(collectHeadlessRun(withActual(IDENTITY))).resolves.toMatchObject({
      result: {
        kind: 'completed',
        diagnostic: {
          usageSource: 'actual',
          usage: { input: 80, output: 20, total: 100 },
          modelSteps: [
            { stepIndex: 0, usageSource: 'actual', usage: { input: 40, output: 8, total: 48 } },
            { stepIndex: 1, usageSource: 'actual', usage: { input: 40, output: 12, total: 52 } },
          ],
        },
      },
    })

    const withoutUsage = createMastraHeadlessExecutor({
      readUserText: async () => '帮我建一个喀纳斯3日团',
      generate: async () => ({ text: '已记下。' }),
    })
    const missing = await collectHeadlessRun(withoutUsage(IDENTITY))
    expect(missing.result).toMatchObject({ kind: 'completed', diagnostic: { usageSource: 'missing' } })
    expect(missing.result.kind === 'completed' ? missing.result.diagnostic?.usage : 'x').toBeUndefined()
  })

  it('turns a TokenLimiter tripwire into a recoverable capacity failure', async () => {
    const executor = createMastraHeadlessExecutor({
      readUserText: async () => '帮我建一个喀纳斯3日团',
      generate: async () => ({
        tripwire: {
          processorId: 'token-limiter',
          reason: 'TokenLimiterProcessor: No messages fit within the remaining token budget.',
        },
      }),
    })

    await expect(collectHeadlessRun(executor(IDENTITY))).resolves.toMatchObject({
      result: {
        kind: 'failed',
        error: { code: 'CONTEXT_CAPACITY_EXCEEDED', retryable: true },
        diagnostic: { errorCode: 'CONTEXT_CAPACITY_EXCEEDED' },
      },
    })
  })
})
