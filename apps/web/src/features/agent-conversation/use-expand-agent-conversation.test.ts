import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useExpandAgentConversation } from './use-expand-agent-conversation'
import { useAgentConversationStore } from './agent-conversation.store'

const navigate = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
  useRouterState: (options?: {
    select?: (state: { location: { pathname: string; searchStr: string; hash: string } }) => unknown
  }) => {
    const state = { location: { pathname: '/departure', searchStr: '?status=open', hash: '' } }
    return options?.select ? options.select(state) : state
  },
}))

describe('useExpandAgentConversation', () => {
  beforeEach(() => {
    navigate.mockReset()
    useAgentConversationStore.setState({
      view: 'history',
      conversationId: 'c-1',
      title: '川西账款',
      returnLocation: null,
      historyRailCollapsed: false,
      globalOpen: false,
    })
  })

  it('opens the same Conversation as a URL-backed overlay over the current business page', () => {
    const { result } = renderHook(() => useExpandAgentConversation())
    result.current()

    expect(useAgentConversationStore.getState()).toMatchObject({
      conversationId: 'c-1',
      globalOpen: true,
      returnLocation: { pathname: '/departure', search: '?status=open', hash: '' },
    })
    expect(navigate).toHaveBeenCalledWith({
      to: '/agent/conversations/$conversationId',
      params: { conversationId: 'c-1' },
      mask: {
        to: '/departure',
        search: { status: 'open' },
        hash: undefined,
      },
    })
  })
})
