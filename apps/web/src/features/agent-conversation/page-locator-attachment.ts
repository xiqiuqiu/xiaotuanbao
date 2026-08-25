import type { AgentConversationView } from './agent-conversation.store'
import type { PageLocator } from '@xiaotuanbao/shared'

export function nextPageLocatorAttachment(input: {
  view: AgentConversationView
  conversationId: string | null
  currentLocator: PageLocator | null
  attachedLocator: PageLocator | null
  captured: boolean
}): PageLocator | null {
  if (input.captured) {
    return input.currentLocator
  }
  if (input.view === 'history' || input.conversationId) {
    return null
  }
  return input.currentLocator
}
