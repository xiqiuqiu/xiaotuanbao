import { beforeEach, describe, expect, it } from 'vitest'
import { useAuthStore } from './auth.store'

const user = {
  id: 'user-1',
  username: 'employee',
  name: '测试员工',
  organizationId: 'org-1',
  organizationName: '测试旅行社',
  roles: ['employee'],
}

describe('auth store', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    useAuthStore.getState().clearSession()
  })

  it('keeps only in-memory session metadata and never persists credentials', () => {
    useAuthStore.getState().setSession(user, ['departure'])

    expect(useAuthStore.getState().isAuthenticated()).toBe(true)
    expect(useAuthStore.getState()).not.toHaveProperty('token')
    expect(localStorage).toHaveLength(0)
    expect(sessionStorage).toHaveLength(0)
  })

  it('clears the in-memory session', () => {
    useAuthStore.getState().setSession(user, ['departure'])
    useAuthStore.getState().clearSession()

    expect(useAuthStore.getState().isAuthenticated()).toBe(false)
    expect(useAuthStore.getState().user).toBeNull()
    expect(useAuthStore.getState().menuKeys).toEqual([])
  })
})
