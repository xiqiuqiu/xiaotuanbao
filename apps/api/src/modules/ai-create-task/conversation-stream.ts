import type { MessageEvent } from '@nestjs/common'
import type { AiConversationEventView, ConversationStreamFrame } from '@xiaotuanbao/shared'
import { Observable } from 'rxjs'
import type { AgentLiveOutput, LiveOutputSnapshot } from './agent-live-output'

export const SSE_HEARTBEAT_MS = 15_000

export function toAssistantSnapshotFrame(
  snapshot: LiveOutputSnapshot,
): Extract<ConversationStreamFrame, { type: 'assistant.snapshot' }> {
  return {
    type: 'assistant.snapshot',
    attemptId: snapshot.attemptId,
    batchId: snapshot.batchId,
    generation: snapshot.generation,
    revision: snapshot.revision,
    reasoningText: snapshot.reasoningText,
    text: snapshot.text,
  }
}

export function wrapConversationEvent(event: AiConversationEventView): MessageEvent {
  return {
    id: String(event.sequence),
    data: { type: 'conversation.event', event } satisfies ConversationStreamFrame,
  }
}

export function snapshotMessage(snapshot: LiveOutputSnapshot): MessageEvent {
  return {
    data: toAssistantSnapshotFrame(snapshot),
  }
}

export function heartbeatMessage(): MessageEvent {
  return { data: { type: 'heartbeat' } satisfies ConversationStreamFrame }
}

export function createConversationStream(params: {
  conversationId: string
  afterSequence: number
  eventHub: { observe: (conversationId: string) => Observable<AiConversationEventView> }
  liveOutput: AgentLiveOutput
  loadEventsAfter: (afterSequence: number) => Promise<AiConversationEventView[]>
  nextCatchUpDelay: (foundEvents: boolean) => number
  heartbeatMs?: number
}): Observable<MessageEvent> {
  const heartbeatMs = params.heartbeatMs ?? SSE_HEARTBEAT_MS
  return new Observable((subscriber) => {
    let cancelled = false
    let lastSeq = params.afterSequence
    let catchUpTimer: ReturnType<typeof setTimeout> | undefined
    let heartbeatTimer: ReturnType<typeof setInterval> | undefined
    const pending = new Map<number, AiConversationEventView>()

    const emitEvent = (event: AiConversationEventView) => {
      if (event.sequence <= lastSeq) {
        return
      }
      pending.set(event.sequence, event)
      let next = pending.get(lastSeq + 1)
      while (next) {
        pending.delete(next.sequence)
        lastSeq = next.sequence
        subscriber.next(wrapConversationEvent(next))
        next = pending.get(lastSeq + 1)
      }
    }

    const liveEvents = params.eventHub.observe(params.conversationId).subscribe(emitEvent)
    const liveOutput = params.liveOutput.observe(params.conversationId).subscribe((snapshot) => {
      if (!cancelled) {
        subscriber.next(snapshotMessage(snapshot))
      }
    })

    void params.liveOutput.getCurrent(params.conversationId).then((snapshot) => {
      if (!cancelled && snapshot) {
        subscriber.next(snapshotMessage(snapshot))
      }
    })

    const poll = async () => {
      if (cancelled) {
        return
      }
      let foundEvents = false
      try {
        const events = await params.loadEventsAfter(lastSeq)
        if (cancelled) {
          return
        }
        foundEvents = events.length > 0
        for (const event of events) {
          emitEvent(event)
        }
      } catch (error: unknown) {
        if (!cancelled) {
          subscriber.error(error)
        }
        return
      }
      catchUpTimer = setTimeout(() => {
        void poll()
      }, params.nextCatchUpDelay(foundEvents))
    }
    void poll()

    heartbeatTimer = setInterval(() => {
      if (!cancelled) {
        subscriber.next(heartbeatMessage())
      }
    }, heartbeatMs)

    return () => {
      cancelled = true
      if (catchUpTimer) {
        clearTimeout(catchUpTimer)
      }
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer)
      }
      liveEvents.unsubscribe()
      liveOutput.unsubscribe()
    }
  })
}
