import { EventEmitter } from 'node:events'
import { Injectable } from '@nestjs/common'
import { Observable } from 'rxjs'
import type { AgentLiveOutput, LiveOutputSnapshot } from './agent-live-output'

@Injectable()
export class InMemoryAgentLiveOutput implements AgentLiveOutput {
  private readonly byAttempt = new Map<string, LiveOutputSnapshot>()
  private readonly emitter = new EventEmitter()

  constructor() {
    this.emitter.setMaxListeners(100)
  }

  async publish(snapshot: LiveOutputSnapshot): Promise<void> {
    this.byAttempt.set(snapshot.attemptId, snapshot)
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
    const matches = [...this.byAttempt.values()].filter(
      (snapshot) => snapshot.conversationId === conversationId,
    )
    if (matches.length === 0) {
      return null
    }
    return matches.reduce((latest, item) =>
      item.generation > latest.generation ||
      (item.generation === latest.generation && item.revision > latest.revision)
        ? item
        : latest,
    )
  }

  async clear(attemptId: string): Promise<void> {
    this.byAttempt.delete(attemptId)
  }
}
