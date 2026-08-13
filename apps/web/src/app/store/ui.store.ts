import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const UI_STORAGE_KEY = 'xiaotuanbao-ui'

interface UiState {
  sidebarCollapsed: boolean
  toggleSidebar: () => void
  setSidebarCollapsed: (collapsed: boolean) => void
  assistPaneCollapsed: boolean
  toggleAssistPane: () => void
  setAssistPaneCollapsed: (collapsed: boolean) => void
}

export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
      sidebarCollapsed: false,
      toggleSidebar: () => set({ sidebarCollapsed: !get().sidebarCollapsed }),
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
      assistPaneCollapsed: true,
      toggleAssistPane: () => set({ assistPaneCollapsed: !get().assistPaneCollapsed }),
      setAssistPaneCollapsed: (collapsed) => set({ assistPaneCollapsed: collapsed }),
    }),
    {
      name: UI_STORAGE_KEY,
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        assistPaneCollapsed: state.assistPaneCollapsed,
      }),
    },
  ),
)
