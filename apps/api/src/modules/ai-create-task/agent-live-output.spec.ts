import { InMemoryAgentLiveOutput } from './agent-live-output.memory'
import type { AgentLiveOutput } from './agent-live-output'
import { LiveOutputFlusher } from './live-output-flusher'
import { LIVE_OUTPUT_FLUSH_MS, LIVE_OUTPUT_TTL_MS } from './agent-live-output'

const identity = {
  attemptId: 'attempt-1',
  organizationId: 'org-1',
  conversationId: 'conversation-1',
  batchId: 'batch-1',
  generation: 2,
}

describe('InMemoryAgentLiveOutput', () => {
  it('isolates snapshots by Attempt and drops superseded leftovers', async () => {
    const live = new InMemoryAgentLiveOutput()
    await live.publish({
      ...identity,
      revision: 1,
      reasoningText: '',
      text: '已',
    })
    await live.publish({
      ...identity,
      attemptId: 'attempt-2',
      generation: 3,
      revision: 1,
      reasoningText: '',
      text: '下一代',
    })

    expect(await live.getCurrent(identity.conversationId)).toMatchObject({
      attemptId: 'attempt-2',
      text: '下一代',
    })

    await live.clear('attempt-2')
    expect(await live.getCurrent(identity.conversationId)).toBeNull()
  })

  it('does not restore a snapshot published after the Attempt was cleared', async () => {
    const live = new InMemoryAgentLiveOutput()
    await live.publish({
      ...identity,
      revision: 4,
      reasoningText: '先核对出团日期',
      text: '已记下半段',
    })
    await live.clear(identity.attemptId)

    await live.publish({
      ...identity,
      revision: 5,
      reasoningText: '迟到思考',
      text: '停止后才赶到的半段',
    })

    expect(await live.getCurrent(identity.conversationId)).toBeNull()
  })

  it('drops older Attempt leftovers when a new Attempt claims the conversation', async () => {
    const live = new InMemoryAgentLiveOutput()
    await live.publish({
      ...identity,
      revision: 4,
      reasoningText: '',
      text: '上一代残留',
    })
    await live.supersede(identity.conversationId, 'attempt-2')
    expect(await live.getCurrent(identity.conversationId)).toBeNull()

    await live.publish({
      ...identity,
      attemptId: 'attempt-2',
      generation: 3,
      revision: 1,
      reasoningText: '',
      text: '新尝试',
    })
    expect(await live.getCurrent(identity.conversationId)).toMatchObject({
      attemptId: 'attempt-2',
      text: '新尝试',
    })
  })

  it('does not let a late older generation overwrite the current Attempt even with a larger revision', async () => {
    const live = new InMemoryAgentLiveOutput()
    await live.publish({
      ...identity,
      attemptId: 'attempt-2',
      generation: 3,
      revision: 1,
      reasoningText: '',
      text: '当前尝试',
    })
    const seen: string[] = []
    const sub = live.observe(identity.conversationId).subscribe((snapshot) => {
      seen.push(snapshot.text)
    })

    await live.publish({
      ...identity,
      attemptId: 'attempt-1',
      generation: 2,
      revision: 99,
      reasoningText: '旧思考',
      text: '上一代迟到',
    })

    expect(await live.getCurrent(identity.conversationId)).toMatchObject({
      attemptId: 'attempt-2',
      generation: 3,
      text: '当前尝试',
    })
    expect(seen).toEqual([])
    sub.unsubscribe()
  })

  it('does not let a mismatched Attempt at the same generation overwrite even with a larger revision', async () => {
    const live = new InMemoryAgentLiveOutput()
    await live.publish({
      ...identity,
      attemptId: 'attempt-2',
      generation: 3,
      revision: 1,
      reasoningText: '',
      text: '当前尝试',
    })

    await live.publish({
      ...identity,
      attemptId: 'attempt-stale',
      generation: 3,
      revision: 50,
      reasoningText: '',
      text: '同代次另一 Attempt',
    })

    expect(await live.getCurrent(identity.conversationId)).toMatchObject({
      attemptId: 'attempt-2',
      text: '当前尝试',
    })
  })

  it('does not treat a Worker-crash leftover as current after expires_at', async () => {
    let now = 1_000
    const live = new InMemoryAgentLiveOutput(() => now)
    await live.publish({
      ...identity,
      revision: 1,
      reasoningText: '崩溃前思考',
      text: '崩溃残留',
    })
    expect(await live.getCurrent(identity.conversationId)).toMatchObject({ text: '崩溃残留' })

    now += LIVE_OUTPUT_TTL_MS + 1
    expect(await live.getCurrent(identity.conversationId)).toBeNull()
  })
})

describe('LiveOutputFlusher', () => {
  it('does not reject the worker when live output publishing fails', async () => {
    let attempts = 0
    const live: AgentLiveOutput = {
      publish: async () => {
        attempts += 1
        if (attempts === 1) {
          throw new Error('Transaction already closed')
        }
      },
      observe: () => {
        throw new Error('not used')
      },
      getCurrent: async () => null,
      clear: async () => undefined,
      supersede: async () => undefined,
    }
    const flusher = new LiveOutputFlusher(live, identity)

    flusher.push({ text: '首个 token' })
    await expect(flusher.flush()).resolves.toBeUndefined()

    flusher.push({ text: '完整回复' })
    await expect(flusher.flush()).resolves.toBeUndefined()
    expect(attempts).toBe(3)
  })

  it('flushes the first 思考过程 token immediately and overwrites the previous step', async () => {
    const live = new InMemoryAgentLiveOutput()
    const seen: Array<{ reasoningText: string; text: string }> = []
    const sub = live.observe(identity.conversationId).subscribe((snapshot) => {
      seen.push({ reasoningText: snapshot.reasoningText, text: snapshot.text })
    })
    const flusher = new LiveOutputFlusher(live, identity)

    flusher.push({ reasoningText: '先核对日期' })
    await flusher.flush()
    expect(seen).toEqual([{ reasoningText: '先核对日期', text: '' }])

    flusher.push({ text: '已记下路线。' })
    await flusher.flush()
    expect(seen.at(-1)).toEqual({ reasoningText: '先核对日期', text: '已记下路线。' })

    flusher.push({ reasoningText: '再核人数' })
    await flusher.flush()
    expect(seen.at(-1)).toEqual({ reasoningText: '再核人数', text: '已记下路线。' })
    sub.unsubscribe()
  })

  it('flushes the first public token immediately without a character gate', async () => {
    const live = new InMemoryAgentLiveOutput()
    const seen: string[] = []
    const sub = live.observe(identity.conversationId).subscribe((snapshot) => {
      seen.push(snapshot.text)
    })
    const flusher = new LiveOutputFlusher(live, identity)

    flusher.push({ text: '已' })
    await flusher.flush()

    expect(seen).toEqual(['已'])
    expect(await live.getCurrent(identity.conversationId)).toMatchObject({
      revision: 1,
      reasoningText: '',
      text: '已',
    })
    sub.unsubscribe()
  })

  it('debounces later tokens to 100ms and can flush ~128 new chars early', async () => {
    const live = new InMemoryAgentLiveOutput()
    const seen: Array<{ text: string; revision: number }> = []
    const sub = live.observe(identity.conversationId).subscribe((snapshot) => {
      seen.push({ text: snapshot.text, revision: snapshot.revision })
    })
    const flusher = new LiveOutputFlusher(live, identity)

    flusher.push({ text: '已' })
    await flusher.flush()
    expect(seen).toEqual([{ text: '已', revision: 1 }])

    flusher.push({ text: '已整理' })
    await new Promise((resolve) => setTimeout(resolve, LIVE_OUTPUT_FLUSH_MS - 20))
    expect(seen).toHaveLength(1)

    await new Promise((resolve) => setTimeout(resolve, 40))
    expect(seen).toEqual([
      { text: '已', revision: 1 },
      { text: '已整理', revision: 2 },
    ])

    const early = `${'已整理'}${'字'.repeat(128)}`
    flusher.push({ text: early })
    await flusher.flush()
    expect(seen.at(-1)).toEqual({ text: early, revision: 3 })
    sub.unsubscribe()
  }, 1_000)
})
