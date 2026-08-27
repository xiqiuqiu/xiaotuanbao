import { EventEmitter } from 'node:events'
import { Injectable } from '@nestjs/common'
import { Observable } from 'rxjs'
import { shouldReplaceLiveOutput } from '@xiaotuanbao/shared'
import {
  LIVE_OUTPUT_TTL_MS,
  type AgentLiveOutput,
  type LiveOutputSnapshot,
} from './agent-live-output'

type StoredSnapshot = LiveOutputSnapshot & { expiresAt: number }

@Injectable()
export class InMemoryAgentLiveOutput implements AgentLiveOutput {
  private readonly byAttempt = new Map<string, StoredSnapshot>()
  private readonly cleared = new Set<string>()
  private readonly emitter = new EventEmitter()

  constructor(private readonly now: () => number = Date.now) {
    this.emitter.setMaxListeners(100)
  }

  async publish(snapshot: LiveOutputSnapshot): Promise<void> {
    if (this.cleared.has(snapshot.attemptId)) {
      return
    }
    const current = await this.getCurrent(snapshot.conversationId)
    if (!shouldReplaceLiveOutput(current, snapshot)) {
      return
    }
    await this.supersede(snapshot.conversationId, snapshot.attemptId)
    this.byAttempt.set(snapshot.attemptId, {
      ...snapshot,
      expiresAt: this.now() + LIVE_OUTPUT_TTL_MS,
    })
    this.emitter.emit(snapshot.conversationId, snapshot)
  }

  observe(conversationId: string): Observable<LiveOutputSnapshot> {
    return new Observable((subscriber) => {
      const handler = (snapshot: LiveOutputSnapshot) => {
        subscriber.next(snapshot)
      }
      this.emitter.on(conversationId, handler)
      return () => {
        this.emitter.off(conversationId, handler)
      }
    })
  }

  async getCurrent(conversationId: string): Promise<LiveOutputSnapshot | null> {
    const now = this.now()
    const matches = [...this.byAttempt.values()].filter(
      (snapshot) => snapshot.conversationId === conversationId && snapshot.expiresAt > now,
    )
    if (matches.length === 0) {
      return null
    }
    const latest = matches.reduce((current, item) =>
      item.generation > current.generation ||
      (item.generation === current.generation && item.revision > current.revision)
        ? item
        : current,
    )
    return toPublicSnapshot(latest)
  }

  async clear(attemptId: string): Promise<void> {
    this.byAttempt.delete(attemptId)
    this.cleared.add(attemptId)
  }

  async supersede(conversationId: string, attemptId: string): Promise<void> {
    for (const [id, existing] of this.byAttempt) {
      if (existing.conversationId === conversationId && id !== attemptId) {
        this.byAttempt.delete(id)
      }
    }
  }
}

function toPublicSnapshot(snapshot: StoredSnapshot): LiveOutputSnapshot {
  return {
    attemptId: snapshot.attemptId,
    organizationId: snapshot.organizationId,
    conversationId: snapshot.conversationId,
    batchId: snapshot.batchId,
    generation: snapshot.generation,
    revision: snapshot.revision,
    reasoningText: snapshot.reasoningText,
    text: snapshot.text,
  }
}
