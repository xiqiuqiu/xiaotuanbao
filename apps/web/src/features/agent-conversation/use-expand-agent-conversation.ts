import { useNavigate, useRouterState } from '@tanstack/react-router'
import {
  NEW_CONVERSATION_ROUTE_ID,
  toReturnNavigateOptions,
} from './agent-conversation-location'
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
    const mask = toReturnNavigateOptions({
      pathname: location.pathname,
      search: location.searchStr,
      hash: location.hash,
    })
    // Keep TanStack's temporary route in history state so a reload restores the
    // same Agent overlay. `unmaskOnReload` would instead load the masked business route.
    void navigate({
      to: '/agent/conversations/$conversationId',
      params: { conversationId: result.conversationId ?? NEW_CONVERSATION_ROUTE_ID },
      mask,
    })
  }
}
