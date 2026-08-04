import { redirect } from '@tanstack/react-router'
import { DEPARTURE_WRITE_ACTION_KEY } from '@xiaotuanbao/shared'
import type { AuthUser } from '@/types/api'
import { useAuthStore } from '@/app/store/auth.store'
import { getMe } from '@/services/auth.service'
import { isMenuPathAllowed } from '@/utils/menu-permission'

export function resolvePostLoginPath(user: Pick<AuthUser, 'isPlatformAdmin'>): '/platform' | '/' {
  return user.isPlatformAdmin ? '/platform' : '/'
}

export function resolvePostLoginDestination(
  user: Pick<AuthUser, 'isPlatformAdmin'>,
  menuKeys: string[],
  actionKeys: string[],
  requestedPath?: string,
): string {
  const defaultPath = resolvePostLoginPath(user)
  if (
    user.isPlatformAdmin ||
    !requestedPath ||
    !requestedPath.startsWith('/') ||
    requestedPath.startsWith('//') ||
    requestedPath.startsWith('/login')
  ) {
    return defaultPath
  }

  return isRouteAllowed(pathnameFromLocalUrl(requestedPath), menuKeys, actionKeys)
    ? requestedPath
    : defaultPath
}

function pathnameFromLocalUrl(url: string): string {
  return url.split(/[?#]/, 1)[0] || '/'
}

/** DEV-only throwaway prototype sandboxes are not menu-gated. */
function isDevPrototypePath(pathname: string): boolean {
  return import.meta.env.DEV && pathname.startsWith('/prototype/')
}

function isRouteAllowed(pathname: string, menuKeys: string[], actionKeys: string[]): boolean {
  if (isDevPrototypePath(pathname)) {
    return true
  }

  if (!isMenuPathAllowed(pathname, menuKeys)) {
    return false
  }

  return pathname !== '/departure/new' || actionKeys.includes(DEPARTURE_WRITE_ACTION_KEY)
}

function assertRouteAccess(pathname: string, menuKeys: string[], actionKeys: string[]) {
  if (!isRouteAllowed(pathname, menuKeys, actionKeys)) {
    throw redirect({ to: '/' })
  }
}

async function restoreSessionIfNeeded() {
  const cached = useAuthStore.getState()
  if (cached.isAuthenticated() && cached.user) {
    return cached.user
  }

  try {
    const me = await getMe({ skipAuthRedirect: true, silentError: true })
    useAuthStore.getState().setSession(me.user, me.menuKeys, me.actionKeys)
    return me.user
  } catch {
    useAuthStore.getState().clearSession()
    return null
  }
}

/**
 * Ensure the SPA has an authenticated tenant session for a protected route.
 * Reuses the in-memory session when present so route intent-preload / in-app
 * navigations do not spam `/auth/me` on every hover.
 */
export async function ensureAuthenticatedSession(requestedUrl: string) {
  const user = await restoreSessionIfNeeded()
  if (!user) {
    throw redirect({ to: '/login', search: { redirect: requestedUrl } })
  }

  if (user.isPlatformAdmin) {
    throw redirect({ to: '/platform' })
  }

  const { menuKeys, actionKeys } = useAuthStore.getState()
  assertRouteAccess(pathnameFromLocalUrl(requestedUrl), menuKeys, actionKeys)
}

/** Ensure the SPA has an authenticated Platform Admin session for `/platform/*`. */
export async function ensurePlatformSession(pathname: string) {
  const user = await restoreSessionIfNeeded()
  if (!user) {
    throw redirect({ to: '/login', search: { redirect: pathname } })
  }

  if (!user.isPlatformAdmin) {
    throw redirect({ to: '/' })
  }
}

export async function hasAuthenticatedSession(): Promise<boolean> {
  try {
    const me = await getMe({ skipAuthRedirect: true, silentError: true })
    useAuthStore.getState().setSession(me.user, me.menuKeys, me.actionKeys)
    return true
  } catch {
    useAuthStore.getState().clearSession()
    return false
  }
}

export async function ensureAnonymousSession(): Promise<void> {
  if (useAuthStore.getState().isAuthenticated() || (await hasAuthenticatedSession())) {
    const user = useAuthStore.getState().user
    throw redirect({ to: resolvePostLoginPath(user ?? { isPlatformAdmin: false }) })
  }
}
