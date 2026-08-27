import { InMemoryAgentLiveOutput } from './agent-live-output.memory'
import { LiveOutputFlusher } from './live-output-flusher'
import { LIVE_OUTPUT_FLUSH_MS } from './agent-live-output'

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
})

describe('LiveOutputFlusher', () => {
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
