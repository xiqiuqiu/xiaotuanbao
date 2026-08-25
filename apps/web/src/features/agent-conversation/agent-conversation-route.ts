import { NEW_CONVERSATION_ROUTE_ID } from './agent-conversation-location'

export function nextAgentConversationRoute(params: {
  routeId: string | undefined
  conversationId: string | null
}):
  | { kind: 'keep' }
  | { kind: 'hydrate'; conversationId: string }
  | { kind: 'navigate'; conversationId: string } {
  const expected = params.conversationId ?? NEW_CONVERSATION_ROUTE_ID
  if (params.routeId === expected) {
    return { kind: 'keep' }
  }
  if (!params.conversationId && params.routeId && params.routeId !== NEW_CONVERSATION_ROUTE_ID) {
    return { kind: 'hydrate', conversationId: params.routeId }
  }
  return { kind: 'navigate', conversationId: expected }
}
