/**
 * Public reply is streamed text-delta / message.delta only.
 * Reasoning must not become live assistant text or persisted agent_message,
 * even when getFullOutput.text concatenates it.
 */
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

/** Self-talk the hide-reasoning UI never sees if it stays on the reasoning channel. */
const SOLILOQUY =
  '用户要建喀纳斯三日团。我先核团名、出团日期和人数，再决定是否提交审核建议。'
const PUBLIC_REPLY = '已提交待审核建议，请在中间表单确认。'

/**
 * Same mapping the worker uses: concatenate message.delta for live public text,
 * persist completed result.message as agent_message.payload.text.
 */
function publicChannels(
  frames: Awaited<ReturnType<typeof collectHeadlessRun>>['frames'],
  result: Awaited<ReturnType<typeof collectHeadlessRun>>['result'],
) {
  return {
    livePublic: frames
      .filter((frame) => frame.type === 'message.delta')
      .map((frame) => frame.text)
      .join(''),
    liveReasoning: frames
      .filter((frame) => frame.type === 'reasoning.delta')
      .map((frame) => frame.text),
    persisted: result.kind === 'completed' ? result.message : '',
  }
}

describe('public reply channel vs hidden reasoning', () => {
  it('keeps typed reasoning-delta off the public reply and off persisted agent_message', async () => {
    const executor = createMastraHeadlessExecutor({
      readUserText: async () => IDENTITY.userText,
      stream: async () => ({
        fullStream: (async function* () {
          yield { type: 'reasoning-delta', payload: { text: SOLILOQUY } }
          yield { type: 'text-delta', payload: { text: PUBLIC_REPLY } }
        })(),
        getFullOutput: async () => ({ text: PUBLIC_REPLY, toolCalls: [] }),
      }),
    })

    const { frames, result } = await collectHeadlessRun(executor(IDENTITY))
    const channels = publicChannels(frames, result)

    expect(channels.liveReasoning.at(-1)).toBe(SOLILOQUY)
    expect(channels.livePublic).toBe(PUBLIC_REPLY)
    expect(channels.persisted).toBe(PUBLIC_REPLY)
    expect(channels.livePublic).not.toContain(SOLILOQUY)
    expect(channels.persisted).not.toContain(SOLILOQUY)
  })

  it('treats thinking-disabled soliloquy in text-delta as public live text and persisted agent_message', async () => {
    const executor = createMastraHeadlessExecutor({
      readUserText: async () => IDENTITY.userText,
      stream: async () => ({
        fullStream: (async function* () {
          yield { type: 'text-delta', payload: { text: SOLILOQUY } }
          yield { type: 'text-delta', payload: { text: PUBLIC_REPLY } }
        })(),
        getFullOutput: async () => ({ text: `${SOLILOQUY}${PUBLIC_REPLY}`, toolCalls: [] }),
      }),
    })

    const { frames, result } = await collectHeadlessRun(executor(IDENTITY))
    const channels = publicChannels(frames, result)

    expect(channels.liveReasoning).toEqual([])
    expect(channels.livePublic).toBe(`${SOLILOQUY}${PUBLIC_REPLY}`)
    expect(channels.persisted).toBe(`${SOLILOQUY}${PUBLIC_REPLY}`)
  })

  it('keeps ordinary no-tool Chinese replies that use 先/再 wording', async () => {
    const reply = '先确认出团日期，再核对接送地点。'
    const executor = createMastraHeadlessExecutor({
      readUserText: async () => IDENTITY.userText,
      stream: async () => ({
        fullStream: (async function* () {
          yield { type: 'text-delta', payload: { text: reply } }
        })(),
        getFullOutput: async () => ({ text: reply, toolCalls: [] }),
      }),
    })

    const { frames, result } = await collectHeadlessRun(executor(IDENTITY))
    const channels = publicChannels(frames, result)
    expect(channels.livePublic).toBe(reply)
    expect(channels.persisted).toBe(reply)
  })

  it('does not publish tool-step soliloquy; live and persisted public reply stay the final business text', async () => {
    const executor = createMastraHeadlessExecutor({
      readUserText: async () => IDENTITY.userText,
      stream: async () => ({
        fullStream: (async function* () {
          yield { type: 'step-start' }
          yield { type: 'text-delta', payload: { text: SOLILOQUY } }
          yield {
            type: 'tool-call',
            payload: { toolCallId: 'call-context', toolName: 'getTaskContext', args: {} },
          }
          yield {
            type: 'tool-result',
            payload: { toolCallId: 'call-context', toolName: 'getTaskContext', result: { snapshot: {} } },
          }
          yield { type: 'step-finish' }
          yield { type: 'step-start' }
          yield { type: 'text-delta', payload: { text: PUBLIC_REPLY } }
          yield { type: 'step-finish' }
        })(),
        getFullOutput: async () => ({
          text: `${SOLILOQUY}${PUBLIC_REPLY}`,
          toolCalls: [{ toolName: 'getTaskContext', toolCallId: 'call-context' }],
          toolResults: [
            { toolName: 'getTaskContext', toolCallId: 'call-context', result: { snapshot: {} } },
          ],
        }),
      }),
    })

    const { frames, result } = await collectHeadlessRun(executor(IDENTITY))
    const channels = publicChannels(frames, result)

    expect(channels.livePublic).toBe(PUBLIC_REPLY)
    expect(channels.persisted).toBe(PUBLIC_REPLY)
    expect(channels.livePublic).not.toContain(SOLILOQUY)
    expect(channels.persisted).not.toContain(SOLILOQUY)
    expect(JSON.stringify(frames.filter((frame) => frame.type === 'message.delta'))).not.toContain(SOLILOQUY)
  })

  it('does not publish tool-step soliloquy when Mastra streams tool-call-input-streaming-start', async () => {
    const executor = createMastraHeadlessExecutor({
      readUserText: async () => IDENTITY.userText,
      stream: async () => ({
        fullStream: (async function* () {
          yield { type: 'step-start' }
          yield { type: 'text-delta', payload: { text: SOLILOQUY } }
          yield {
            type: 'tool-call-input-streaming-start',
            payload: { toolCallId: 'call-context', toolName: 'getTaskContext' },
          }
          yield {
            type: 'tool-call',
            payload: { toolCallId: 'call-context', toolName: 'getTaskContext', args: {} },
          }
          yield {
            type: 'tool-result',
            payload: { toolCallId: 'call-context', toolName: 'getTaskContext', result: { snapshot: {} } },
          }
          yield { type: 'step-finish' }
          yield { type: 'step-start' }
          yield { type: 'text-delta', payload: { text: PUBLIC_REPLY } }
          yield { type: 'step-finish' }
        })(),
        getFullOutput: async () => ({
          text: `${SOLILOQUY}${PUBLIC_REPLY}`,
          toolCalls: [{ toolName: 'getTaskContext', toolCallId: 'call-context' }],
          toolResults: [
            { toolName: 'getTaskContext', toolCallId: 'call-context', result: { snapshot: {} } },
          ],
        }),
      }),
    })

    const { frames, result } = await collectHeadlessRun(executor(IDENTITY))
    const channels = publicChannels(frames, result)
    expect(channels.livePublic).toBe(PUBLIC_REPLY)
    expect(channels.persisted).toBe(PUBLIC_REPLY)
    expect(channels.livePublic).not.toContain(SOLILOQUY)
  })

  it('does not fall back to aggregated full output when the final public step is empty', async () => {
    const executor = createMastraHeadlessExecutor({
      readUserText: async () => IDENTITY.userText,
      stream: async () => ({
        fullStream: (async function* () {
          yield { type: 'text-delta', payload: { text: SOLILOQUY } }
          yield {
            type: 'tool-call',
            payload: { toolCallId: 'call-context', toolName: 'getTaskContext', args: {} },
          }
          yield {
            type: 'tool-result',
            payload: { toolCallId: 'call-context', toolName: 'getTaskContext', result: { snapshot: {} } },
          }
        })(),
        getFullOutput: async () => ({
          text: SOLILOQUY,
          toolCalls: [{ toolName: 'getTaskContext', toolCallId: 'call-context' }],
          toolResults: [
            { toolName: 'getTaskContext', toolCallId: 'call-context', result: { snapshot: {} } },
          ],
        }),
      }),
    })

    const { frames, result } = await collectHeadlessRun(executor(IDENTITY))
    const channels = publicChannels(frames, result)
    expect(channels.livePublic).not.toContain(SOLILOQUY)
    expect(channels.persisted).not.toContain(SOLILOQUY)
    expect(result.kind).toBe('completed')
    if (result.kind === 'completed') {
      expect(result.message).toBe('已处理当前说明。')
    }
  })

  it('does not leak buffered tool-step soliloquy when the run ends as awaiting_review', async () => {
    const executor = createMastraHeadlessExecutor({
      readUserText: async () => IDENTITY.userText,
      stream: async () => ({
        fullStream: (async function* () {
          yield { type: 'text-delta', payload: { text: SOLILOQUY } }
          yield {
            type: 'tool-call',
            payload: { toolCallId: 'call-review', toolName: 'proposeReviewPackage', args: {} },
          }
          yield {
            type: 'tool-result',
            payload: {
              toolName: 'proposeReviewPackage',
              toolCallId: 'call-review',
              result: {
                status: 'accepted',
                objectVersion: 2,
                confirmationUnit: 'basic_info_draft',
                candidates: [
                  {
                    fieldKey: 'routeName',
                    proposedValue: '喀纳斯3日线',
                    clarity: 'clear',
                    evidence: [{ kind: 'user_message', sequence: 1, excerpt: '帮我建一个喀纳斯3日团' }],
                  },
                ],
              },
            },
          }
        })(),
        getFullOutput: async () => ({
          text: SOLILOQUY,
          toolCalls: [{ toolName: 'proposeReviewPackage', toolCallId: 'call-review' }],
          toolResults: [],
        }),
      }),
    })

    const { frames, result } = await collectHeadlessRun(executor(IDENTITY))
    expect(result.kind).toBe('awaiting_review')
    expect(frames.filter((frame) => frame.type === 'message.delta')).toEqual([])
    expect(JSON.stringify(frames)).not.toContain(SOLILOQUY)
  })

  it('does not publish tool-step soliloquy when the run ends as awaiting_user_input', async () => {
    const prompt = '请补充出团日期和人数。'
    const executor = createMastraHeadlessExecutor({
      readUserText: async () => IDENTITY.userText,
      stream: async () => ({
        fullStream: (async function* () {
          yield { type: 'text-delta', payload: { text: SOLILOQUY } }
          yield {
            type: 'tool-call',
            payload: { toolCallId: 'call-route', toolName: 'routeConversation', args: {} },
          }
          yield {
            type: 'tool-result',
            payload: {
              toolName: 'routeConversation',
              toolCallId: 'call-route',
              result: {
                status: 'accepted',
                decision: 'request_clarification',
                interaction: { type: 'free_text', prompt },
              },
            },
          }
        })(),
        getFullOutput: async () => ({
          text: SOLILOQUY,
          toolCalls: [{ toolName: 'routeConversation', toolCallId: 'call-route' }],
          toolResults: [],
        }),
      }),
    })

    const { frames, result } = await collectHeadlessRun(executor(IDENTITY))
    expect(result.kind).toBe('awaiting_user_input')
    if (result.kind === 'awaiting_user_input') {
      expect(result.interaction.prompt).toBe(prompt)
    }
    expect(frames.filter((frame) => frame.type === 'message.delta')).toEqual([])
    expect(JSON.stringify(frames)).not.toContain(SOLILOQUY)
  })

  it('does not publish tool-step soliloquy when a review package is rejected', async () => {
    const executor = createMastraHeadlessExecutor({
      readUserText: async () => IDENTITY.userText,
      stream: async () => ({
        fullStream: (async function* () {
          yield { type: 'text-delta', payload: { text: SOLILOQUY } }
          yield {
            type: 'tool-call',
            payload: { toolCallId: 'call-review', toolName: 'proposeReviewPackage', args: {} },
          }
          yield {
            type: 'tool-result',
            payload: {
              toolName: 'proposeReviewPackage',
              toolCallId: 'call-review',
              result: {
                status: 'rejected',
                errors: [{ candidateIndex: 0, evidenceIndex: 0, code: 'EXCERPT_NOT_FOUND', message: '摘录对不上冻结消息' }],
              },
            },
          }
        })(),
        getFullOutput: async () => ({
          text: SOLILOQUY,
          toolCalls: [{ toolName: 'proposeReviewPackage', toolCallId: 'call-review' }],
          toolResults: [],
        }),
      }),
    })

    const { frames, result } = await collectHeadlessRun(executor(IDENTITY))
    expect(result.kind).toBe('failed')
    expect(frames.filter((frame) => frame.type === 'message.delta')).toEqual([])
    expect(JSON.stringify(frames)).not.toContain(SOLILOQUY)
  })


  it('maps unwrapped AI SDK delta-field chunks onto reasoning vs public reply', async () => {
    const executor = createMastraHeadlessExecutor({
      readUserText: async () => IDENTITY.userText,
      stream: async () => ({
        fullStream: (async function* () {
          yield { type: 'reasoning-delta', id: 'reasoning-0', delta: SOLILOQUY }
          yield { type: 'text-delta', id: 'txt-0', delta: PUBLIC_REPLY }
        })(),
        getFullOutput: async () => ({ text: PUBLIC_REPLY, toolCalls: [] }),
      }),
    })

    const { frames, result } = await collectHeadlessRun(executor(IDENTITY))
    const channels = publicChannels(frames, result)

    expect(channels.liveReasoning.at(-1)).toBe(SOLILOQUY)
    expect(channels.livePublic).toBe(PUBLIC_REPLY)
    expect(channels.persisted).toBe(PUBLIC_REPLY)
  })

  it('does not persist reasoning that getFullOutput.text concatenated onto the public reply', async () => {
    const executor = createMastraHeadlessExecutor({
      readUserText: async () => IDENTITY.userText,
      stream: async () => ({
        fullStream: (async function* () {
          yield { type: 'reasoning-delta', payload: { text: SOLILOQUY } }
          yield { type: 'text-delta', payload: { text: PUBLIC_REPLY } }
        })(),
        getFullOutput: async () => ({ text: `${SOLILOQUY}${PUBLIC_REPLY}`, toolCalls: [] }),
      }),
    })

    const { frames, result } = await collectHeadlessRun(executor(IDENTITY))
    const channels = publicChannels(frames, result)

    expect(channels.livePublic).toBe(PUBLIC_REPLY)
    expect(channels.persisted).toBe(PUBLIC_REPLY)
  })

  it('does not persist think-tag soliloquy; English-only business replies stay on the public channel', async () => {
    const englishReply =
      'The vehicle is booked for April 2 to April 6. Please confirm the supplier and total price in the review form.'
    const executor = createMastraHeadlessExecutor({
      readUserText: async () => IDENTITY.userText,
      stream: async () => ({
        fullStream: (async function* () {
          yield { type: 'text-delta', payload: { text: englishReply } }
        })(),
        getFullOutput: async () => ({
          text: englishReply,
          toolCalls: [],
        }),
      }),
    })

    const { frames, result } = await collectHeadlessRun(executor(IDENTITY))
    const channels = publicChannels(frames, result)

    expect(channels.persisted).toBe(englishReply)
    expect(channels.livePublic).toBe(englishReply)
  })

  it('does not publish think-tag soliloquy from thinking-disabled content as the public reply', async () => {
    const executor = createMastraHeadlessExecutor({
      readUserText: async () => IDENTITY.userText,
      stream: async () => ({
        fullStream: (async function* () {
          yield { type: 'text-delta', payload: { text: `<think>${SOLILOQUY}</think>` } }
          yield { type: 'text-delta', payload: { text: PUBLIC_REPLY } }
        })(),
        getFullOutput: async () => ({
          text: `<think>${SOLILOQUY}</think>${PUBLIC_REPLY}`,
          toolCalls: [],
        }),
      }),
    })

    const { frames, result } = await collectHeadlessRun(executor(IDENTITY))
    const channels = publicChannels(frames, result)

    expect(channels.livePublic).not.toContain(SOLILOQUY)
    expect(channels.persisted).toBe(PUBLIC_REPLY)
  })

  it('does not leak a think tag that is split across text-delta chunks', async () => {
    const executor = createMastraHeadlessExecutor({
      readUserText: async () => IDENTITY.userText,
      stream: async () => ({
        fullStream: (async function* () {
          yield { type: 'text-delta', payload: { text: '<thi' } }
          yield { type: 'text-delta', payload: { text: `nk>${SOLILOQUY}</think>${PUBLIC_REPLY}` } }
        })(),
        getFullOutput: async () => ({
          text: `<think>${SOLILOQUY}</think>${PUBLIC_REPLY}`,
          toolCalls: [],
        }),
      }),
    })

    const { frames, result } = await collectHeadlessRun(executor(IDENTITY))
    const channels = publicChannels(frames, result)

    expect(channels.livePublic).not.toContain(SOLILOQUY)
    expect(channels.livePublic).not.toContain('<thi')
    expect(channels.persisted).toBe(PUBLIC_REPLY)
  })
})
