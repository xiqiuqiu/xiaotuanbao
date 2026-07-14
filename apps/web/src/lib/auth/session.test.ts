import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@/app/store/auth.store'
import { getMe } from '@/services/auth.service'
import {
  ensureAnonymousSession,
  ensureAuthenticatedSession,
} from './session'

vi.mock('@/services/auth.service', () => ({
  getMe: vi.fn(),
}))

const user = {
  id: 'user-1',
  username: 'employee',
  name: '测试员工',
  organizationId: 'org-1',
  organizationName: '测试旅行社',
  roles: ['employee'],
}

async function captureRedirect(action: () => Promise<void>) {
  try {
    await action()
    throw new Error('expected redirect')
  } catch (error) {
    return error as Response & { options: { to: string; search?: Record<string, string> } }
  }
}

describe('cookie-backed route session', () => {
  beforeEach(() => {
    vi.mocked(getMe).mockReset()
    useAuthStore.getState().clearSession()
  })

  it('restores a protected route after refresh from the server Cookie session', async () => {
    vi.mocked(getMe).mockResolvedValue({ user, menuKeys: ['/departure'] })

    await ensureAuthenticatedSession('/departure')

    expect(getMe).toHaveBeenCalledWith({ skipAuthRedirect: true, silentError: true })
    expect(useAuthStore.getState().user).toEqual(user)
    expect(useAuthStore.getState().isAuthenticated()).toBe(true)
  })

  it('redirects an anonymous protected-route visit to login with its return path', async () => {
    vi.mocked(getMe).mockRejectedValue(new Error('401'))

    const redirect = await captureRedirect(() => ensureAuthenticatedSession('/departure/new'))

    expect(redirect.status).toBe(307)
    expect(redirect.options).toMatchObject({
      to: '/login',
      search: { redirect: '/departure/new' },
    })
    expect(useAuthStore.getState().isAuthenticated()).toBe(false)
  })

  it('redirects an authenticated but unauthorized route to home', async () => {
    vi.mocked(getMe).mockResolvedValue({ user, menuKeys: ['/departure'] })

    const redirect = await captureRedirect(() =>
      ensureAuthenticatedSession('/finance/payable'),
    )

    expect(redirect.options).toMatchObject({ to: '/' })
  })

  it('reuses an in-memory session without calling getMe again', async () => {
    useAuthStore.getState().setSession(user, ['/departure', '/finance/payable'])

    await ensureAuthenticatedSession('/finance/payable')

    expect(getMe).not.toHaveBeenCalled()
    expect(useAuthStore.getState().isAuthenticated()).toBe(true)
  })

  it('blocks unauthorized paths from the cached session without contacting /auth/me', async () => {
    useAuthStore.getState().setSession(user, ['/departure'])

    const redirect = await captureRedirect(() =>
      ensureAuthenticatedSession('/finance/payable'),
    )

    expect(getMe).not.toHaveBeenCalled()
    expect(redirect.options).toMatchObject({ to: '/' })
  })

  it('redirects a login-page visit when an HttpOnly Cookie session already exists', async () => {
    vi.mocked(getMe).mockResolvedValue({ user, menuKeys: ['/departure'] })

    const redirect = await captureRedirect(ensureAnonymousSession)

    expect(redirect.options).toMatchObject({ to: '/departure' })
    expect(useAuthStore.getState().isAuthenticated()).toBe(true)
  })
})
