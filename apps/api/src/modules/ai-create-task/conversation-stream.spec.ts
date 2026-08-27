import type { AiConversationEventView } from '@xiaotuanbao/shared'
import { Subject, firstValueFrom, take } from 'rxjs'
import { InMemoryAgentLiveOutput } from './agent-live-output.memory'
import { LIVE_OUTPUT_TTL_MS } from './agent-live-output'
import {
  createConversationStream,
  heartbeatMessage,
  serializeConversationSseFrame,
  snapshotMessage,
  wrapConversationEvent,
} from './conversation-stream'

function eventView(sequence: number, kind: string, payload: Record<string, unknown> = {}): AiConversationEventView {
  return {
    id: `evt-${sequence}`,
    sequence,
    kind: kind as AiConversationEventView['kind'],
    payload,
    createdAt: '2026-08-26T00:00:00.000Z',
  }
}

describe('serializeConversationSseFrame', () => {
  it('omits SSE id for snapshot and heartbeat, and sets id only on conversation events', () => {
    expect(
      serializeConversationSseFrame(
        snapshotMessage({
          attemptId: 'attempt-1',
          organizationId: 'org-1',
          conversationId: 'conversation-1',
          batchId: 'batch-1',
          generation: 2,
          revision: 4,
          reasoningText: '先核对出团日期',
          text: '已整理当前资料。',
        }),
      ),
    ).toBe(
      `data: ${JSON.stringify({
        type: 'assistant.snapshot',
        attemptId: 'attempt-1',
        batchId: 'batch-1',
        generation: 2,
        revision: 4,
        reasoningText: '先核对出团日期',
        text: '已整理当前资料。',
      })}\n\n`,
    )
    expect(serializeConversationSseFrame(heartbeatMessage())).toBe(
      'data: {"type":"heartbeat"}\n\n',
    )
    expect(serializeConversationSseFrame(wrapConversationEvent(eventView(3, 'user_message')))).toMatch(
      /^id: 3\ndata: /,
    )
  })
})

describe('createConversationStream', () => {
  it('emits the current assistant snapshot without an SSE id, then wraps events with ids', async () => {
    const live = new InMemoryAgentLiveOutput()
    await live.publish({
      attemptId: 'attempt-1',
      organizationId: 'org-1',
      conversationId: 'conversation-1',
      batchId: 'batch-1',
      generation: 1,
      revision: 3,
      reasoningText: '先核对出团日期',
      text: '已整理当前',
    })
    const hub = new Subject<AiConversationEventView>()
    const frames: Array<{ id?: string; data: unknown }> = []

    const stream = createConversationStream({
      conversationId: 'conversation-1',
      afterSequence: 0,
      eventHub: { observe: () => hub.asObservable() },
      liveOutput: live,
      loadEventsAfter: async () => [eventView(1, 'user_message', { text: '查账款' })],
      nextCatchUpDelay: () => 60_000,
      heartbeatMs: 60_000,
    })
    const sub = stream.subscribe((frame) => {
      frames.push(frame)
    })

    await new Promise((resolve) => setImmediate(resolve))
    hub.next(eventView(1, 'user_message', { text: '查账款' }))
    hub.next(eventView(2, 'batch_status', { status: 'agent_running', attemptId: 'attempt-1' }))
    await new Promise((resolve) => setImmediate(resolve))

    expect(frames[0]).toEqual({
      data: {
        type: 'assistant.snapshot',
        attemptId: 'attempt-1',
        batchId: 'batch-1',
        generation: 1,
        revision: 3,
        reasoningText: '先核对出团日期',
        text: '已整理当前',
      },
    })
    expect(frames[0]?.id).toBeUndefined()
    expect(frames.some((frame) => frame.id === '1' && (frame.data as { type: string }).type === 'conversation.event')).toBe(
      true,
    )
    expect(
      JSON.stringify(frames.filter((frame) => (frame.data as { type?: string }).type === 'conversation.event')),
    ).not.toContain('先核对出团日期')
    expect(
      frames.some((frame) => frame.id === '2' && (frame.data as { type: string }).type === 'conversation.event'),
    ).toBe(true)
    sub.unsubscribe()
  })

  it('emits the current snapshot before Last-Event-ID catch-up even when snapshot load is slower', async () => {
    const live = new InMemoryAgentLiveOutput()
    await live.publish({
      attemptId: 'attempt-1',
      organizationId: 'org-1',
      conversationId: 'conversation-1',
      batchId: 'batch-1',
      generation: 2,
      revision: 4,
      reasoningText: '先核对出团日期',
      text: '已整理当前资料。',
    })
    const hub = new Subject<AiConversationEventView>()
    const frames: Array<{ id?: string; data: unknown }> = []
    const delayedLive = {
      publish: live.publish.bind(live),
      observe: live.observe.bind(live),
      clear: live.clear.bind(live),
      supersede: live.supersede.bind(live),
      getCurrent: async (conversationId: string) => {
        await new Promise((resolve) => setTimeout(resolve, 40))
        return live.getCurrent(conversationId)
      },
    }

    const stream = createConversationStream({
      conversationId: 'conversation-1',
      afterSequence: 2,
      eventHub: { observe: () => hub.asObservable() },
      liveOutput: delayedLive,
      loadEventsAfter: async (afterSequence) => {
        expect(afterSequence).toBe(2)
        return [eventView(3, 'batch_status', { status: 'agent_running', attemptId: 'attempt-1' })]
      },
      nextCatchUpDelay: () => 60_000,
      heartbeatMs: 60_000,
    })
    const sub = stream.subscribe((frame) => {
      frames.push(frame)
    })

    await new Promise((resolve) => setTimeout(resolve, 80))

    const snapshotIndex = frames.findIndex(
      (frame) => (frame.data as { type?: string }).type === 'assistant.snapshot',
    )
    const eventIndex = frames.findIndex(
      (frame) => (frame.data as { type?: string }).type === 'conversation.event',
    )
    expect(snapshotIndex).toBe(0)
    expect(frames[0]?.id).toBeUndefined()
    expect(frames[0]?.data).toEqual({
      type: 'assistant.snapshot',
      attemptId: 'attempt-1',
      batchId: 'batch-1',
      generation: 2,
      revision: 4,
      reasoningText: '先核对出团日期',
      text: '已整理当前资料。',
    })
    expect(eventIndex).toBeGreaterThan(snapshotIndex)
    expect(frames[eventIndex]).toMatchObject({
      id: '3',
      data: { type: 'conversation.event', event: { sequence: 3 } },
    })
    expect(frames.some((frame) => frame.id === '1' || frame.id === '2')).toBe(false)
    sub.unsubscribe()
  })

  it('holds live snapshot updates until the reconnect snapshot has been sent', async () => {
    const live = new InMemoryAgentLiveOutput()
    await live.publish({
      attemptId: 'attempt-1',
      organizationId: 'org-1',
      conversationId: 'conversation-1',
      batchId: 'batch-1',
      generation: 2,
      revision: 3,
      reasoningText: '先核对',
      text: '已',
    })
    const hub = new Subject<AiConversationEventView>()
    const frames: Array<{ id?: string; data: unknown }> = []
    let releaseCurrent: (() => void) | undefined
    const delayedLive = {
      publish: live.publish.bind(live),
      observe: live.observe.bind(live),
      clear: live.clear.bind(live),
      supersede: live.supersede.bind(live),
      getCurrent: async (conversationId: string) => {
        await new Promise<void>((resolve) => {
          releaseCurrent = resolve
        })
        return live.getCurrent(conversationId)
      },
    }

    const stream = createConversationStream({
      conversationId: 'conversation-1',
      afterSequence: 0,
      eventHub: { observe: () => hub.asObservable() },
      liveOutput: delayedLive,
      loadEventsAfter: async () => [],
      nextCatchUpDelay: () => 60_000,
      heartbeatMs: 60_000,
    })
    const sub = stream.subscribe((frame) => {
      frames.push(frame)
    })

    await new Promise((resolve) => setImmediate(resolve))
    await live.publish({
      attemptId: 'attempt-1',
      organizationId: 'org-1',
      conversationId: 'conversation-1',
      batchId: 'batch-1',
      generation: 2,
      revision: 4,
      reasoningText: '先核对出团日期',
      text: '已整理当前资料。',
    })
    expect(frames).toEqual([])

    releaseCurrent?.()
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(frames).toHaveLength(1)
    expect(frames[0]?.id).toBeUndefined()
    expect(frames[0]?.data).toMatchObject({
      type: 'assistant.snapshot',
      attemptId: 'attempt-1',
      revision: 4,
      text: '已整理当前资料。',
    })
    sub.unsubscribe()
  })

  it('still catch-up events when the current snapshot cannot be loaded', async () => {
    const live = new InMemoryAgentLiveOutput()
    const hub = new Subject<AiConversationEventView>()
    const frames: Array<{ id?: string; data: unknown }> = []
    const failingLive = {
      publish: live.publish.bind(live),
      observe: live.observe.bind(live),
      clear: live.clear.bind(live),
      supersede: live.supersede.bind(live),
      getCurrent: async () => {
        throw new Error('listen snapshot unavailable')
      },
    }

    const stream = createConversationStream({
      conversationId: 'conversation-1',
      afterSequence: 2,
      eventHub: { observe: () => hub.asObservable() },
      liveOutput: failingLive,
      loadEventsAfter: async () => [eventView(3, 'batch_status', { status: 'agent_running' })],
      nextCatchUpDelay: () => 60_000,
      heartbeatMs: 60_000,
    })
    const errors: unknown[] = []
    const sub = stream.subscribe({
      next: (frame) => {
        frames.push(frame)
      },
      error: (error) => {
        errors.push(error)
      },
    })

    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(errors).toEqual([])
    expect(
      frames.some((frame) => (frame.data as { type?: string }).type === 'assistant.snapshot'),
    ).toBe(false)
    expect(frames.some((frame) => frame.id === '3')).toBe(true)
    sub.unsubscribe()
  })

  it('does not put an SSE id on heartbeat frames', async () => {
    const live = new InMemoryAgentLiveOutput()
    const hub = new Subject<AiConversationEventView>()
    const stream = createConversationStream({
      conversationId: 'conversation-1',
      afterSequence: 0,
      eventHub: { observe: () => hub.asObservable() },
      liveOutput: live,
      loadEventsAfter: async () => [],
      nextCatchUpDelay: () => 60_000,
      heartbeatMs: 20,
    })
    const frame = await firstValueFrom(stream.pipe(take(1)))
    expect(frame).toEqual({ data: { type: 'heartbeat' } })
    expect(frame.id).toBeUndefined()
  })

  it('does not emit an expired leftover snapshot as the current SSE output', async () => {
    let now = 1_000
    const live = new InMemoryAgentLiveOutput(() => now)
    await live.publish({
      attemptId: 'attempt-1',
      organizationId: 'org-1',
      conversationId: 'conversation-1',
      batchId: 'batch-1',
      generation: 1,
      revision: 3,
      reasoningText: '',
      text: '崩溃残留',
    })
    now += LIVE_OUTPUT_TTL_MS + 1

    const hub = new Subject<AiConversationEventView>()
    const frames: Array<{ id?: string; data: unknown }> = []
    const stream = createConversationStream({
      conversationId: 'conversation-1',
      afterSequence: 0,
      eventHub: { observe: () => hub.asObservable() },
      liveOutput: live,
      loadEventsAfter: async () => [],
      nextCatchUpDelay: () => 60_000,
      heartbeatMs: 60_000,
    })
    const sub = stream.subscribe((frame) => {
      frames.push(frame)
    })
    await new Promise((resolve) => setImmediate(resolve))

    expect(
      frames.some((frame) => (frame.data as { type?: string }).type === 'assistant.snapshot'),
    ).toBe(false)
    sub.unsubscribe()
  })
})
