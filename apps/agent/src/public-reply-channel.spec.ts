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

  it('does not persist English thinking-disabled soliloquy as the public reply', async () => {
    const englishSoliloquy =
      "I'll check the current task context first, then help add a vehicle departure resource. The user wants to add a vehicle."
    const executor = createMastraHeadlessExecutor({
      readUserText: async () => IDENTITY.userText,
      stream: async () => ({
        fullStream: (async function* () {
          yield { type: 'text-delta', payload: { text: englishSoliloquy } }
          yield { type: 'text-delta', payload: { text: PUBLIC_REPLY } }
        })(),
        getFullOutput: async () => ({
          text: `${englishSoliloquy}${PUBLIC_REPLY}`,
          toolCalls: [],
        }),
      }),
    })

    const { frames, result } = await collectHeadlessRun(executor(IDENTITY))
    const channels = publicChannels(frames, result)

    expect(channels.persisted).toBe(PUBLIC_REPLY)
    expect(channels.persisted).not.toContain("I'll check")
    expect(channels.livePublic).not.toContain("I'll check")
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
})
