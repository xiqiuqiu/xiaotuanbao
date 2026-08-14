import { Injectable } from '@nestjs/common'
import { Observable } from 'rxjs'
import { EventEmitter } from 'node:events'
import type { AiConversationEventView } from '@xiaotuanbao/shared'

@Injectable()
export class AiConversationEventHub {
  private readonly emitter = new EventEmitter()

  constructor() {
    this.emitter.setMaxListeners(100)
  }

  publish(conversationId: string, event: AiConversationEventView): void {
    this.emitter.emit(conversationId, event)
  }

  observe(conversationId: string): Observable<AiConversationEventView> {
    return new Observable((subscriber) => {
      const handler = (event: AiConversationEventView) => {
        subscriber.next(event)
      }
      this.emitter.on(conversationId, handler)
      return () => {
        this.emitter.off(conversationId, handler)
      }
    })
  }
}
