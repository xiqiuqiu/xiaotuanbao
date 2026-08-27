import type { AiConversationEventView } from '@xiaotuanbao/shared'
import { Subject, firstValueFrom, take } from 'rxjs'
import { InMemoryAgentLiveOutput } from './agent-live-output.memory'
import { createConversationStream } from './conversation-stream'

function eventView(sequence: number, kind: string, payload: Record<string, unknown> = {}): AiConversationEventView {
  return {
    id: `evt-${sequence}`,
    sequence,
    kind: kind as AiConversationEventView['kind'],
    payload,
    createdAt: '2026-08-26T00:00:00.000Z',
  }
}

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
})
