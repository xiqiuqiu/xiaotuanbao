import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AGENT_RETURN_LOCATION_STORAGE_KEY } from './agent-conversation-location'
import { useAgentConversationStore } from './agent-conversation.store'

describe('agent conversation store #370', () => {
  beforeEach(() => {
    sessionStorage.clear()
    useAgentConversationStore.setState({
      view: 'page',
      conversationId: null,
      title: '新会话',
      returnLocation: null,
      historyRailCollapsed: false,
    })
  })

  afterEach(() => {
    sessionStorage.clear()
  })

  it('keeps the same Conversation ID when expanding into global mode', () => {
    useAgentConversationStore.getState().selectConversation({
      id: 'c-1',
      title: '川西账款',
    })
    const result = useAgentConversationStore.getState().expandToGlobal({
      pathname: '/departure',
      searchStr: '?status=open',
    })

    expect(result).toEqual({
      conversationId: 'c-1',
      href: '/agent/conversations/c-1',
    })
    expect(useAgentConversationStore.getState()).toMatchObject({
      conversationId: 'c-1',
      title: '川西账款',
      returnLocation: { pathname: '/departure', search: '?status=open', hash: '' },
    })
    expect(sessionStorage.getItem(AGENT_RETURN_LOCATION_STORAGE_KEY)).toContain('/departure')
  })

  it('expands an unsaved new conversation without creating an ID', () => {
    useAgentConversationStore.getState().startNewConversation()
    const result = useAgentConversationStore.getState().expandToGlobal({
      pathname: '/partner',
    })

    expect(result).toEqual({
      conversationId: null,
      href: '/agent/conversations/new',
    })
    expect(useAgentConversationStore.getState().conversationId).toBeNull()
  })

  it('returns to the captured business location and restores the same conversation', () => {
    useAgentConversationStore.getState().selectConversation({
      id: 'c-2',
      title: '历史会话',
    })
    useAgentConversationStore.getState().expandToGlobal({
      pathname: '/departure/d-1',
      searchStr: '?tab=overview',
    })

    const restored = useAgentConversationStore.getState().exitGlobal()

    expect(restored).toEqual({
      pathname: '/departure/d-1',
      search: '?tab=overview',
      hash: '',
    })
    expect(useAgentConversationStore.getState()).toMatchObject({
      conversationId: 'c-2',
      title: '历史会话',
      returnLocation: null,
    })
    expect(sessionStorage.getItem(AGENT_RETURN_LOCATION_STORAGE_KEY)).toBeNull()
  })

  it('falls back to the workbench when no usable return location exists', () => {
    const restored = useAgentConversationStore.getState().exitGlobal()
    expect(restored).toEqual({ pathname: '/', search: '', hash: '' })
  })
})
