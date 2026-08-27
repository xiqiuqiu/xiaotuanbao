import type { AiConversationEventView } from '@xiaotuanbao/shared'

export function latestConversationEventSequence(events: AiConversationEventView[]): number {
  return events.reduce((latest, event) => Math.max(latest, event.sequence), 0)
}

export function proposedTaskToClaim({
  conversationId,
  runtimeConversationId,
  events,
  afterSequence,
  currentTaskId,
  historical,
}: {
  conversationId: string | null
  runtimeConversationId: string | null
  events: AiConversationEventView[]
  afterSequence: number
  currentTaskId: string | null
  historical: boolean
}): string | null {
  if (
    !conversationId ||
    conversationId !== runtimeConversationId ||
    currentTaskId ||
    historical
  ) {
    return null
  }

  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    const createdTaskId = event.payload.createdTaskId
    if (
      event.sequence > afterSequence &&
      event.kind === 'batch_status' &&
      event.payload.continuation === true &&
      typeof createdTaskId === 'string' &&
      createdTaskId.trim()
    ) {
      return createdTaskId.trim()
    }
  }

  return null
}
