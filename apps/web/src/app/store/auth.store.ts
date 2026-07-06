import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AuthUser } from '@/types/api'

const AUTH_STORAGE_KEY = 'xiaotuanbao-auth'

interface AuthState {
  token: string | null
  user: AuthUser | null
  menuKeys: string[]
  setSession: (token: string, user: AuthUser, menuKeys: string[]) => void
  logout: () => void
  isAuthenticated: () => boolean
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      menuKeys: [],
      setSession: (token, user, menuKeys) => set({ token, user, menuKeys }),
      logout: () => set({ token: null, user: null, menuKeys: [] }),
      isAuthenticated: () => Boolean(get().token),
    }),
    {
      name: AUTH_STORAGE_KEY,
      partialize: (state) => ({
        token: state.token,
        user: state.user,
        menuKeys: state.menuKeys,
      }),
    },
  ),
)
