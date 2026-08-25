import { useNavigate, useRouterState } from '@tanstack/react-router'
import { NEW_CONVERSATION_ROUTE_ID } from './agent-conversation-location'
import { useAgentConversationStore } from './agent-conversation.store'

export function useExpandAgentConversation() {
  const navigate = useNavigate()
  const location = useRouterState({ select: (state) => state.location })
  const expandToGlobal = useAgentConversationStore((state) => state.expandToGlobal)

  return () => {
    const result = expandToGlobal({
      pathname: location.pathname,
      searchStr: location.searchStr,
      hash: location.hash,
    })
    void navigate({
      to: '/agent/conversations/$conversationId',
      params: { conversationId: result.conversationId ?? NEW_CONVERSATION_ROUTE_ID },
    })
  }
}
