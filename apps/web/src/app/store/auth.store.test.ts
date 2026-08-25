import { beforeEach, describe, expect, it } from 'vitest'
import { AGENT_RETURN_LOCATION_STORAGE_KEY } from '@/features/agent-conversation/agent-conversation-location'
import { useAgentConversationRuntimeStore } from '@/features/agent-conversation/agent-conversation-runtime.store'
import { useAgentConversationStore } from '@/features/agent-conversation/agent-conversation.store'
import { useAuthStore } from './auth.store'

const user = {
  id: 'user-1',
  username: 'employee',
  name: '测试员工',
  organizationId: 'org-1',
  organizationName: '测试旅行社',
  roles: ['employee'],
  isPlatformAdmin: false,
}

describe('auth store', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    useAuthStore.getState().clearSession()
  })

  it('keeps only in-memory session metadata and never persists credentials', () => {
    useAuthStore.getState().setSession(user, ['/departure'], ['departure:write'])

    expect(useAuthStore.getState().isAuthenticated()).toBe(true)
    expect(useAuthStore.getState().menuKeys).toEqual(['/departure'])
    expect(useAuthStore.getState().actionKeys).toEqual(['departure:write'])
    expect(useAuthStore.getState()).not.toHaveProperty('token')
    expect(localStorage).toHaveLength(0)
    expect(sessionStorage).toHaveLength(0)
  })

  it('clears the in-memory session', () => {
    useAuthStore.getState().setSession(user, ['/departure'], ['departure:write'])
    useAuthStore.getState().clearSession()

    expect(useAuthStore.getState().isAuthenticated()).toBe(false)
    expect(useAuthStore.getState().user).toBeNull()
    expect(useAuthStore.getState().menuKeys).toEqual([])
    expect(useAuthStore.getState().actionKeys).toEqual([])
  })

  it('drops Agent overlay and runtime so the next tenant cannot see the previous transcript', () => {
    useAgentConversationStore.setState({
      view: 'history',
      conversationId: 'c-prev',
      title: '前一用户会话',
      returnLocation: { pathname: '/departure', search: '', hash: '' },
      historyRailCollapsed: true,
      globalOpen: true,
    })
    sessionStorage.setItem(
      AGENT_RETURN_LOCATION_STORAGE_KEY,
      JSON.stringify({ pathname: '/departure', search: '', hash: '' }),
    )
    useAgentConversationRuntimeStore.getState().hydrate({
      conversationId: 'c-prev',
      draft: '未发送草稿',
      pendingText: '发送中的提问',
      events: [
        {
          id: 'e-secret',
          sequence: 1,
          kind: 'user_message',
          payload: { text: '上一租户机密' },
          createdAt: '2026-08-25T00:00:00.000Z',
        },
      ],
      sending: true,
      sendIdempotencyKey: 'idem-prev',
    })

    useAuthStore.getState().clearSession()

    expect(useAgentConversationStore.getState()).toMatchObject({
      conversationId: null,
      title: '新会话',
      globalOpen: false,
      returnLocation: null,
      view: 'page',
    })
    expect(useAgentConversationRuntimeStore.getState()).toMatchObject({
      conversationId: null,
      draft: '',
      pendingText: null,
      events: [],
      sending: false,
      sendIdempotencyKey: null,
    })
    expect(sessionStorage.getItem(AGENT_RETURN_LOCATION_STORAGE_KEY)).toBeNull()
  })
})
