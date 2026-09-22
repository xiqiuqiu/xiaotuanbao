import { isAgentConversationPath, readPersistedReturnLocation } from './agent-conversation-location'
import { useRouterState } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { useAgentConversationStore } from './agent-conversation.store'
import {
  currentPageAttachmentFromLocation,
  type AgentCurrentPageAttachment,
} from './page-locator-attachment'

export function useCurrentPageAttachment(): AgentCurrentPageAttachment | null {
  const location = useRouterState({ select: (state) => state.location })
  const queryClient = useQueryClient()
  const returnLocation = useAgentConversationStore((state) => state.returnLocation)
  const source = (isAgentConversationPath(location.pathname) ? returnLocation ?? readPersistedReturnLocation() : null) ?? {
    pathname: location.pathname,
    search: location.searchStr,
  }
  const attachment = currentPageAttachmentFromLocation(source.pathname, source.search)
  if (attachment?.kind !== 'page_locator') {
    return attachment
  }
  const objectLabel =
    attachment.locator.kind === 'departure'
      ? queryClient.getQueryData<{ departureNo?: string }>([
          'departure',
          attachment.locator.objectId,
        ])?.departureNo
      : queryClient.getQueryData<{ name?: string }>([
          'partner',
          attachment.locator.objectId,
        ])?.name
  return {
    ...attachment,
    objectLabel: objectLabel || attachment.locator.objectId,
  }
}
