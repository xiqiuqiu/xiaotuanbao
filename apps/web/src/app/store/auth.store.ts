import { create } from 'zustand'
import type { AuthUser } from '@/types/api'

interface AuthState {
  user: AuthUser | null
  menuKeys: string[]
  actionKeys: string[]
  sessionStatus: 'unknown' | 'authenticated' | 'anonymous'
  setSession: (user: AuthUser, menuKeys: string[], actionKeys: string[]) => void
  clearSession: () => void
  isAuthenticated: () => boolean
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  user: null,
  menuKeys: [],
  actionKeys: [],
  sessionStatus: 'unknown',
  setSession: (user, menuKeys, actionKeys) =>
    set({ user, menuKeys, actionKeys, sessionStatus: 'authenticated' }),
  clearSession: () =>
    set({ user: null, menuKeys: [], actionKeys: [], sessionStatus: 'anonymous' }),
  isAuthenticated: () => get().sessionStatus === 'authenticated',
}))
