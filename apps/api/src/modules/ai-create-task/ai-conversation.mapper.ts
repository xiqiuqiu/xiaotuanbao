import type {
  AiConversationEventView,
  AiConversationView,
  AiInputBatchView,
} from '@xiaotuanbao/shared'
import type {
  AiConversation,
  AiConversationEvent,
  AiInputBatch,
} from '@prisma/client'

export function toEventView(event: AiConversationEvent): AiConversationEventView {
  return {
    sequence: event.sequence,
    kind: event.kind,
    payload: asRecord(event.payload),
    createdAt: event.createdAt.toISOString(),
  }
}

export function toBatchView(batch: AiInputBatch): AiInputBatchView {
  return {
    id: batch.id,
    status: batch.status,
    conversationVersion: batch.conversationVersion,
  }
}

export function toConversationView(
  conversation: AiConversation,
  events: AiConversationEvent[],
  activeBatch: AiInputBatch | null,
): AiConversationView {
  return {
    id: conversation.id,
    status: conversation.status,
    events: events.map(toEventView),
    activeBatch: activeBatch ? toBatchView(activeBatch) : null,
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}
