import { useRouterState } from '@tanstack/react-router'
import { useAgentConversationStore } from './agent-conversation.store'
import { isAgentConversationPath, readPersistedReturnLocation } from './agent-conversation-location'
import { departureIdFromPathname } from './task-descriptor-navigation'

export function useBusinessDepartureId() {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const returnLocation = useAgentConversationStore((state) => state.returnLocation)
  return departureIdFromPathname(isAgentConversationPath(pathname)
    ? (returnLocation ?? readPersistedReturnLocation())?.pathname ?? ''
    : pathname)
}
