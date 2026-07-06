import { redirect } from '@tanstack/react-router'
import { useAuthStore } from '@/app/store/auth.store'
import { getMe } from '@/services/auth.service'
import { isMenuPathAllowed } from '@/utils/menu-permission'

export async function ensureAuthenticatedSession(pathname: string) {
  const state = useAuthStore.getState()

  if (!state.isAuthenticated()) {
    throw redirect({ to: '/login', search: { redirect: pathname } })
  }

  try {
    const me = await getMe()
    state.setSession(state.token!, me.user, me.menuKeys)
  } catch {
    state.logout()
    throw redirect({ to: '/login', search: { redirect: pathname } })
  }

  if (!isMenuPathAllowed(pathname, useAuthStore.getState().menuKeys)) {
    throw redirect({ to: '/' })
  }
}
