import { useRouterState } from '@tanstack/react-router'
import { useAgentConversationStore } from './agent-conversation.store'
import {
  currentPageAttachmentFromLocation,
  type AgentCurrentPageAttachment,
} from './page-locator-attachment'

export function useCurrentPageAttachment(): AgentCurrentPageAttachment | null {
  const location = useRouterState({ select: (state) => state.location })
  const returnLocation = useAgentConversationStore((state) => state.returnLocation)
  const source = returnLocation ?? {
    pathname: location.pathname,
    search: location.searchStr,
  }
  return currentPageAttachmentFromLocation(source.pathname, source.search)
}
