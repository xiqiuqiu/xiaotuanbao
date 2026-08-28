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
      globalOpen: false,
      attachedPageAttachment: null,
      pageContextDismissed: false,
    })
  })

  afterEach(() => {
    sessionStorage.clear()
  })

  it('keeps the same Conversation ID when expanding into global mode', () => {
    useAgentConversationStore.getState().persistConversation({
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
      globalOpen: true,
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
    useAgentConversationStore.getState().persistConversation({
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
      globalOpen: false,
      returnLocation: null,
    })
    expect(sessionStorage.getItem(AGENT_RETURN_LOCATION_STORAGE_KEY)).toBeNull()
  })

  it('opens global mode from a conversation route without losing the selected Conversation', () => {
    useAgentConversationStore.getState().persistConversation({
      id: 'c-3',
      title: '深链会话',
    })
    useAgentConversationStore.getState().openGlobalFromRoute('c-3')
    expect(useAgentConversationStore.getState()).toMatchObject({
      conversationId: 'c-3',
      title: '深链会话',
      globalOpen: true,
    })
  })

  it('falls back to the workbench when no usable return location exists', () => {
    const restored = useAgentConversationStore.getState().exitGlobal()
    expect(restored).toEqual({ pathname: '/', search: '', hash: '' })
  })

  it('restores the selected Conversation after a full page reload', () => {
    useAgentConversationStore.getState().persistConversation({
      id: 'c-reload',
      title: '用这份文件创建发团',
    })

    useAgentConversationStore.setState({
      view: 'page',
      conversationId: null,
      title: '新会话',
      returnLocation: null,
      historyRailCollapsed: false,
      globalOpen: false,
      attachedPageAttachment: null,
      pageContextDismissed: false,
    })
    useAgentConversationStore.getState().hydrateFromSession()

    expect(useAgentConversationStore.getState()).toMatchObject({
      conversationId: 'c-reload',
      title: '用这份文件创建发团',
      view: 'history',
    })
  })

  it('resets overlay, selected Conversation and persisted return location', () => {
    useAgentConversationStore.getState().persistConversation({
      id: 'c-prev',
      title: '前一用户会话',
    })
    useAgentConversationStore.getState().expandToGlobal({
      pathname: '/departure',
    })
    useAgentConversationStore.getState().setHistoryRailCollapsed(true)

    useAgentConversationStore.getState().reset()

    expect(useAgentConversationStore.getState()).toMatchObject({
      view: 'page',
      conversationId: null,
      title: '新会话',
      returnLocation: null,
      historyRailCollapsed: false,
      globalOpen: false,
    })
    expect(sessionStorage.getItem(AGENT_RETURN_LOCATION_STORAGE_KEY)).toBeNull()
  })
})

describe('agent conversation page locator #371', () => {
  beforeEach(() => {
    useAgentConversationStore.getState().reset()
  })

  it('attaches the current page on a new conversation and drops it when switching history', () => {
    useAgentConversationStore.getState().startNewConversation({
      kind: 'page_locator',
      locator: { kind: 'partner', objectId: 'partner-1', section: 'accounts' },
    })
    expect(useAgentConversationStore.getState().attachedPageAttachment).toEqual({
      kind: 'page_locator',
      locator: { kind: 'partner', objectId: 'partner-1', section: 'accounts' },
    })

    useAgentConversationStore.getState().persistConversation({
      id: 'c-new',
      title: '刚发出的新会话',
    })
    expect(useAgentConversationStore.getState().attachedPageAttachment).toEqual({
      kind: 'page_locator',
      locator: { kind: 'partner', objectId: 'partner-1', section: 'accounts' },
    })
    useAgentConversationStore.getState().openHistoricalConversation({
      id: 'c-1',
      title: '历史会话',
    })
    expect(useAgentConversationStore.getState().attachedPageAttachment).toBeNull()
  })

  it('does not restore a dismissed locator until the user captures the page again', () => {
    useAgentConversationStore.getState().startNewConversation({
      kind: 'page_locator',
      locator: { kind: 'departure', objectId: 'departure-1' },
    })
    useAgentConversationStore.getState().detachCurrentPage()
    useAgentConversationStore.getState().syncDefaultPageAttachment({
      kind: 'page_locator',
      locator: { kind: 'departure', objectId: 'departure-1' },
    })
    expect(useAgentConversationStore.getState().attachedPageAttachment).toBeNull()

    useAgentConversationStore.getState().attachCurrentPage({
      kind: 'page_locator',
      locator: { kind: 'departure', objectId: 'departure-1', section: 'overview' },
    })
    expect(useAgentConversationStore.getState().attachedPageAttachment).toEqual({
      kind: 'page_locator',
      locator: { kind: 'departure', objectId: 'departure-1', section: 'overview' },
    })
  })

  it('keeps the attached locator when the first send persists a new conversation', () => {
    useAgentConversationStore.getState().startNewConversation({
      kind: 'page_locator',
      locator: { kind: 'departure', objectId: 'departure-1' },
    })
    useAgentConversationStore.getState().persistConversation({
      id: 'c-new',
      title: '查一下账款',
    })
    expect(useAgentConversationStore.getState()).toMatchObject({
      conversationId: 'c-new',
      view: 'new',
      attachedPageAttachment: {
        kind: 'page_locator',
        locator: { kind: 'departure', objectId: 'departure-1' },
      },
    })
  })

  it('attaches the wizard task when it is persisted after the active conversation starts', () => {
    useAgentConversationStore.getState().persistConversation({
      id: 'c-new',
      title: '新建川西发团',
    })

    useAgentConversationStore.getState().syncDefaultPageAttachment({
      kind: 'agent_task',
      taskType: 'departure_creation',
      taskId: 'task-1',
    })

    expect(useAgentConversationStore.getState().attachedPageAttachment).toEqual({
      kind: 'agent_task',
      taskType: 'departure_creation',
      taskId: 'task-1',
    })
  })

  it('keeps an explicitly captured locator when the same conversation title is refreshed', () => {
    useAgentConversationStore.getState().persistConversation({
      id: 'c-1',
      title: '历史会话',
    })
    useAgentConversationStore.getState().attachCurrentPage({
      kind: 'page_locator',
      locator: { kind: 'departure', objectId: 'departure-1' },
    })
    useAgentConversationStore.getState().persistConversation({
      id: 'c-1',
      title: '历史会话（已更新）',
    })
    expect(useAgentConversationStore.getState().attachedPageAttachment).toEqual({
      kind: 'page_locator',
      locator: { kind: 'departure', objectId: 'departure-1' },
    })
  })

  it('keeps an explicitly captured locator when reopening the same historical conversation', () => {
    useAgentConversationStore.getState().openHistoricalConversation({
      id: 'c-1',
      title: '历史会话',
    })
    useAgentConversationStore.getState().attachCurrentPage({
      kind: 'page_locator',
      locator: { kind: 'departure', objectId: 'departure-1' },
    })

    useAgentConversationStore.getState().openHistoricalConversation({
      id: 'c-1',
      title: '历史会话',
    })

    expect(useAgentConversationStore.getState().attachedPageAttachment).toEqual({
      kind: 'page_locator',
      locator: { kind: 'departure', objectId: 'departure-1' },
    })
  })
})
