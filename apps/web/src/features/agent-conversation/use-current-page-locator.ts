import { useRouterState } from '@tanstack/react-router'
import { parsePageLocatorFromLocation, type PageLocator } from '@xiaotuanbao/shared'
import { useAgentConversationStore } from './agent-conversation.store'

export function useCurrentPageLocator(): PageLocator | null {
  const location = useRouterState({ select: (state) => state.location })
  const returnLocation = useAgentConversationStore((state) => state.returnLocation)
  const source = returnLocation ?? {
    pathname: location.pathname,
    search: location.searchStr,
  }
  return parsePageLocatorFromLocation(source.pathname, source.search)
}
