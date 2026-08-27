import type { MessageEvent } from '@nestjs/common'
import type { Response } from 'express'
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

/** Nest `@Sse` 会给缺 id 的帧自动编号；snapshot / heartbeat 必须自己写成无 id 的 SSE 文本。 */
export function serializeConversationSseFrame(frame: MessageEvent): string {
  const data = `data: ${JSON.stringify(frame.data)}\n\n`
  if (frame.id == null || frame.id === '') {
    return data
  }
  return `id: ${String(frame.id).replace(/[\r\n]/g, '')}\n${data}`
}

export function writeConversationSse(res: Response, stream: Observable<MessageEvent>): void {
  res.status(200)
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('X-Accel-Buffering', 'no')
  res.setHeader('Content-Encoding', 'identity')
  res.setHeader('Connection', 'keep-alive')
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders()
  }
  res.socket?.setTimeout?.(0)
  res.socket?.setNoDelay?.(true)
  res.write(': connected\n\n')

  const subscription = stream.subscribe({
    next: (frame) => {
      if (!res.writableEnded) {
        res.write(serializeConversationSseFrame(frame))
      }
    },
    error: () => {
      if (!res.writableEnded) {
        res.end()
      }
    },
    complete: () => {
      if (!res.writableEnded) {
        res.end()
      }
    },
  })
  res.on('close', () => {
    subscription.unsubscribe()
    if (!res.writableEnded) {
      res.end()
    }
  })
}

function latestSnapshot(snapshots: LiveOutputSnapshot[]): LiveOutputSnapshot | null {
  return snapshots.reduce<LiveOutputSnapshot | null>((current, snapshot) => {
    if (!current) {
      return snapshot
    }
    if (
      snapshot.generation > current.generation ||
      (snapshot.generation === current.generation && snapshot.revision > current.revision)
    ) {
      return snapshot
    }
    return current
  }, null)
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
    let snapshotReady = false
    let lastSeq = params.afterSequence
    let catchUpTimer: ReturnType<typeof setTimeout> | undefined
    let heartbeatTimer: ReturnType<typeof setInterval> | undefined
    const pending = new Map<number, AiConversationEventView>()
    const pendingSnapshots: LiveOutputSnapshot[] = []
    let initialSnapshot: LiveOutputSnapshot | null = null

    const flushPendingEvents = () => {
      let next = pending.get(lastSeq + 1)
      while (next) {
        pending.delete(next.sequence)
        lastSeq = next.sequence
        subscriber.next(wrapConversationEvent(next))
        next = pending.get(lastSeq + 1)
      }
    }

    const emitEvent = (event: AiConversationEventView) => {
      if (event.sequence <= lastSeq) {
        return
      }
      pending.set(event.sequence, event)
      if (snapshotReady) {
        flushPendingEvents()
      }
    }

    const liveEvents = params.eventHub.observe(params.conversationId).subscribe(emitEvent)
    const liveOutput = params.liveOutput.observe(params.conversationId).subscribe((snapshot) => {
      if (cancelled) {
        return
      }
      if (!snapshotReady) {
        pendingSnapshots.push(snapshot)
        return
      }
      subscriber.next(snapshotMessage(snapshot))
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

    const startAfterSnapshot = () => {
      if (cancelled || snapshotReady) {
        return
      }
      snapshotReady = true
      const reconnectSnapshot = latestSnapshot([
        ...(initialSnapshot ? [initialSnapshot] : []),
        ...pendingSnapshots,
      ])
      pendingSnapshots.length = 0
      if (reconnectSnapshot) {
        subscriber.next(snapshotMessage(reconnectSnapshot))
      }
      flushPendingEvents()
      void poll()
      heartbeatTimer = setInterval(() => {
        if (!cancelled) {
          subscriber.next(heartbeatMessage())
        }
      }, heartbeatMs)
    }

    void params.liveOutput
      .getCurrent(params.conversationId)
      .then((snapshot) => {
        initialSnapshot = snapshot
      })
      .catch(() => {
        initialSnapshot = null
      })
      .finally(() => {
        startAfterSnapshot()
      })

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
