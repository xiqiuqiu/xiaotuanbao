import { redirect } from '@tanstack/react-router'
import { useAuthStore } from '@/app/store/auth.store'
import { getMe } from '@/services/auth.service'
import { isMenuPathAllowed } from '@/utils/menu-permission'

export async function ensureAuthenticatedSession(pathname: string) {
  try {
    const me = await getMe({ skipAuthRedirect: true, silentError: true })
    useAuthStore.getState().setSession(me.user, me.menuKeys)
  } catch {
    useAuthStore.getState().clearSession()
    throw redirect({ to: '/login', search: { redirect: pathname } })
  }

  if (!isMenuPathAllowed(pathname, useAuthStore.getState().menuKeys)) {
    throw redirect({ to: '/' })
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
    throw redirect({ to: '/departure' })
  }
}
