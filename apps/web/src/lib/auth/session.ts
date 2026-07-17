import { redirect } from '@tanstack/react-router'
import type { AuthUser } from '@/types/api'
import { useAuthStore } from '@/app/store/auth.store'
import { getMe } from '@/services/auth.service'
import { isMenuPathAllowed } from '@/utils/menu-permission'

export function resolvePostLoginPath(user: Pick<AuthUser, 'isPlatformAdmin'>): '/platform' | '/departure' {
  return user.isPlatformAdmin ? '/platform' : '/departure'
}

function assertMenuAccess(pathname: string, menuKeys: string[]) {
  if (!isMenuPathAllowed(pathname, menuKeys)) {
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
    useAuthStore.getState().setSession(me.user, me.menuKeys)
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
export async function ensureAuthenticatedSession(pathname: string) {
  const user = await restoreSessionIfNeeded()
  if (!user) {
    throw redirect({ to: '/login', search: { redirect: pathname } })
  }

  if (user.isPlatformAdmin) {
    throw redirect({ to: '/platform' })
  }

  assertMenuAccess(pathname, useAuthStore.getState().menuKeys)
}

/** Ensure the SPA has an authenticated Platform Admin session for `/platform/*`. */
export async function ensurePlatformSession(pathname: string) {
  const user = await restoreSessionIfNeeded()
  if (!user) {
    throw redirect({ to: '/login', search: { redirect: pathname } })
  }

  if (!user.isPlatformAdmin) {
    throw redirect({ to: '/departure' })
  }
}

export async function hasAuthenticatedSession(): Promise<boolean> {
  try {
    const me = await getMe({ skipAuthRedirect: true, silentError: true })
    useAuthStore.getState().setSession(me.user, me.menuKeys)
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
