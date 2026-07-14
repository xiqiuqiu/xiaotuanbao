import { redirect } from '@tanstack/react-router'
import { useAuthStore } from '@/app/store/auth.store'
import { getMe } from '@/services/auth.service'
import { isMenuPathAllowed } from '@/utils/menu-permission'

function assertMenuAccess(pathname: string, menuKeys: string[]) {
  if (!isMenuPathAllowed(pathname, menuKeys)) {
    throw redirect({ to: '/' })
  }
}

/**
 * Ensure the SPA has an authenticated session for a protected route.
 * Reuses the in-memory session when present so route intent-preload / in-app
 * navigations do not spam `/auth/me` on every hover.
 */
export async function ensureAuthenticatedSession(pathname: string) {
  const cached = useAuthStore.getState()
  if (cached.isAuthenticated()) {
    assertMenuAccess(pathname, cached.menuKeys)
    return
  }

  try {
    const me = await getMe({ skipAuthRedirect: true, silentError: true })
    useAuthStore.getState().setSession(me.user, me.menuKeys)
  } catch {
    useAuthStore.getState().clearSession()
    throw redirect({ to: '/login', search: { redirect: pathname } })
  }

  assertMenuAccess(pathname, useAuthStore.getState().menuKeys)
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
    throw redirect({ to: '/departure' })
  }
}
