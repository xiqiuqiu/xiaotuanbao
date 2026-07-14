import { create } from 'zustand'
import type { AuthUser } from '@/types/api'

interface AuthState {
  user: AuthUser | null
  menuKeys: string[]
  sessionStatus: 'unknown' | 'authenticated' | 'anonymous'
  setSession: (user: AuthUser, menuKeys: string[]) => void
  clearSession: () => void
  isAuthenticated: () => boolean
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  user: null,
  menuKeys: [],
  sessionStatus: 'unknown',
  setSession: (user, menuKeys) =>
    set({ user, menuKeys, sessionStatus: 'authenticated' }),
  clearSession: () =>
    set({ user: null, menuKeys: [], sessionStatus: 'anonymous' }),
  isAuthenticated: () => get().sessionStatus === 'authenticated',
}))
