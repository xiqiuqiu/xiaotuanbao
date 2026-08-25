import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@/app/store/auth.store'
import { getMe } from '@/services/auth.service'
import {
  ensureAnonymousSession,
  ensureAuthenticatedSession,
  ensurePlatformSession,
  resolvePostLoginDestination,
  resolvePostLoginPath,
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
  isPlatformAdmin: false,
}

const platformAdmin = {
  ...user,
  id: 'platform-1',
  username: 'platform',
  name: '平台管理员',
  organizationName: '平台运营组织',
  roles: [] as string[],
  isPlatformAdmin: true,
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
    vi.mocked(getMe).mockResolvedValue({ user, menuKeys: ['/departure'], actionKeys: [] })

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
    vi.mocked(getMe).mockResolvedValue({ user, menuKeys: ['/departure'], actionKeys: [] })

    const redirect = await captureRedirect(() =>
      ensureAuthenticatedSession('/finance/payable'),
    )

    expect(redirect.options).toMatchObject({ to: '/' })
  })

  it('reuses an in-memory session without calling getMe again', async () => {
    useAuthStore.getState().setSession(user, ['/departure', '/finance/payable'], [])

    await ensureAuthenticatedSession('/finance/payable')

    expect(getMe).not.toHaveBeenCalled()
    expect(useAuthStore.getState().isAuthenticated()).toBe(true)
  })

  it('blocks unauthorized paths from the cached session without contacting /auth/me', async () => {
    useAuthStore.getState().setSession(user, ['/departure'], [])

    const redirect = await captureRedirect(() =>
      ensureAuthenticatedSession('/finance/payable'),
    )

    expect(getMe).not.toHaveBeenCalled()
    expect(redirect.options).toMatchObject({ to: '/' })
  })

  it('blocks departure creation without departure:write', async () => {
    useAuthStore.getState().setSession(user, ['/departure'], [])

    const redirect = await captureRedirect(() =>
      ensureAuthenticatedSession('/departure/new'),
    )

    expect(getMe).not.toHaveBeenCalled()
    expect(redirect.options).toMatchObject({ to: '/' })
  })

  it('redirects a login-page visit when an HttpOnly Cookie session already exists', async () => {
    vi.mocked(getMe).mockResolvedValue({ user, menuKeys: ['/departure'], actionKeys: [] })

    const redirect = await captureRedirect(ensureAnonymousSession)

    expect(redirect.options).toMatchObject({ to: '/' })
    expect(useAuthStore.getState().isAuthenticated()).toBe(true)
  })

  it('sends Platform Admin from login page to the platform area', async () => {
    vi.mocked(getMe).mockResolvedValue({ user: platformAdmin, menuKeys: [], actionKeys: [] })

    const redirect = await captureRedirect(ensureAnonymousSession)

    expect(redirect.options).toMatchObject({ to: '/platform' })
  })

  it('keeps Platform Admin out of tenant business routes', async () => {
    useAuthStore.getState().setSession(platformAdmin, [], [])

    const redirect = await captureRedirect(() => ensureAuthenticatedSession('/departure'))

    expect(redirect.options).toMatchObject({ to: '/platform' })
  })

  it('allows Platform Admin into the platform shell', async () => {
    useAuthStore.getState().setSession(platformAdmin, [], [])

    await ensurePlatformSession('/platform')

    expect(getMe).not.toHaveBeenCalled()
  })

  it('keeps tenant users out of the platform shell', async () => {
    useAuthStore.getState().setSession(user, ['/departure'], [])

    const redirect = await captureRedirect(() => ensurePlatformSession('/platform'))

    expect(redirect.options).toMatchObject({ to: '/' })
  })

  it('resolves post-login destination by platform identity', () => {
    expect(resolvePostLoginPath(platformAdmin)).toBe('/platform')
    expect(resolvePostLoginPath(user)).toBe('/')
  })

  it('keeps an authorized local deep link after tenant login', () => {
    expect(
      resolvePostLoginDestination(user, ['/departure'], [], '/departure/departure-1'),
    ).toBe('/departure/departure-1')
    expect(
      resolvePostLoginDestination(
        user,
        ['/departure'],
        [],
        '/departure/departure-1?tab=execution',
      ),
    ).toBe('/departure/departure-1?tab=execution')
    expect(resolvePostLoginDestination(user, ['/departure'], [], '/finance/payable')).toBe('/')
    expect(resolvePostLoginDestination(user, ['/departure'], [], '//evil.example')).toBe('/')
    expect(
      resolvePostLoginDestination(platformAdmin, [], [], '/departure/departure-1'),
    ).toBe('/platform')
  })

  it('does not preserve the departure creation deep link without departure:write', () => {
    expect(resolvePostLoginDestination(user, ['/departure'], [], '/departure/new')).toBe('/')
    expect(
      resolvePostLoginDestination(
        user,
        ['/departure'],
        ['departure:write'],
        '/departure/new?copyFrom=departure-1',
      ),
    ).toBe('/departure/new?copyFrom=departure-1')
  })

  it('allows an authenticated tenant into the global Agent conversation route', async () => {
    useAuthStore.getState().setSession(user, ['/departure'], [])

    await ensureAuthenticatedSession('/agent/conversations/c-1')

    expect(getMe).not.toHaveBeenCalled()
    expect(useAuthStore.getState().isAuthenticated()).toBe(true)
  })

  it('preserves a global Agent conversation deep link after tenant login', () => {
    expect(
      resolvePostLoginDestination(user, ['/departure'], [], '/agent/conversations/c-1'),
    ).toBe('/agent/conversations/c-1')
  })

  it('preserves DEV prototype sandbox deep links without a matching menu key', () => {
    expect(
      resolvePostLoginDestination(
        user,
        ['/departure'],
        [],
        '/prototype/route-ledger-mode?variant=A',
      ),
    ).toBe('/prototype/route-ledger-mode?variant=A')
  })
})
