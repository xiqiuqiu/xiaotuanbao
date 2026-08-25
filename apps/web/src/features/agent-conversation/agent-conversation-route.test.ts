import { describe, expect, it } from 'vitest'
import { nextAgentConversationRoute } from './agent-conversation-route'

describe('nextAgentConversationRoute', () => {
  it('keeps the current Conversation when the route already matches', () => {
    expect(
      nextAgentConversationRoute({ routeId: 'c-1', conversationId: 'c-1' }),
    ).toEqual({ kind: 'keep' })
  })

  it('hydrates from the URL only when the store has no Conversation yet', () => {
    expect(
      nextAgentConversationRoute({ routeId: 'c-1', conversationId: null }),
    ).toEqual({ kind: 'hydrate', conversationId: 'c-1' })
  })

  it('navigates to the selected Conversation instead of overwriting it from a stale URL', () => {
    expect(
      nextAgentConversationRoute({ routeId: 'c-1', conversationId: 'c-2' }),
    ).toEqual({ kind: 'navigate', conversationId: 'c-2' })
    expect(
      nextAgentConversationRoute({ routeId: 'c-1', conversationId: null }),
    ).not.toEqual({ kind: 'navigate', conversationId: 'new' })
    expect(
      nextAgentConversationRoute({ routeId: 'new', conversationId: 'c-2' }),
    ).toEqual({ kind: 'navigate', conversationId: 'c-2' })
  })
})
