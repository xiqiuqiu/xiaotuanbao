import { create } from 'zustand'
import {
  agentConversationPath,
  captureReturnLocation,
  fallbackReturnLocation,
  persistReturnLocation,
  readPersistedReturnLocation,
  type AgentReturnLocation,
} from './agent-conversation-location'

export const NEW_CONVERSATION_TITLE = '新会话'

export type AgentConversationView = 'page' | 'history' | 'new'

interface AgentConversationState {
  view: AgentConversationView
  conversationId: string | null
  title: string
  returnLocation: AgentReturnLocation | null
  historyRailCollapsed: boolean
  globalOpen: boolean
  selectConversation: (conversation: { id: string; title: string }) => void
  startNewConversation: () => void
  expandToGlobal: (location: {
    pathname: string
    search?: string
    searchStr?: string
    hash?: string
  }) => { conversationId: string | null; href: string }
  exitGlobal: () => AgentReturnLocation
  openGlobalFromRoute: (conversationId: string | null) => void
  setHistoryRailCollapsed: (collapsed: boolean) => void
}

export const useAgentConversationStore = create<AgentConversationState>((set, get) => ({
  view: 'page',
  conversationId: null,
  title: NEW_CONVERSATION_TITLE,
  returnLocation: null,
  historyRailCollapsed: false,
  globalOpen: false,
  selectConversation: (conversation) =>
    set({
      view: 'history',
      conversationId: conversation.id,
      title: conversation.title || NEW_CONVERSATION_TITLE,
    }),
  startNewConversation: () =>
    set({
      view: 'new',
      conversationId: null,
      title: NEW_CONVERSATION_TITLE,
    }),
  expandToGlobal: (location) => {
    const current = get()
    const captured = captureReturnLocation(location)
    if (captured) {
      persistReturnLocation(captured)
      set({ returnLocation: captured, globalOpen: true })
    } else {
      set({ globalOpen: true })
    }
    return {
      conversationId: current.conversationId,
      href: agentConversationPath(current.conversationId),
    }
  },
  exitGlobal: () => {
    const restored =
      get().returnLocation ?? readPersistedReturnLocation() ?? fallbackReturnLocation()
    persistReturnLocation(null)
    set({ returnLocation: null, globalOpen: false })
    return restored
  },
  openGlobalFromRoute: (conversationId) => {
    const current = get()
    if (conversationId && conversationId !== current.conversationId) {
      set({
        globalOpen: true,
        view: 'history',
        conversationId,
        title: current.title || NEW_CONVERSATION_TITLE,
      })
      return
    }
    if (!conversationId && current.conversationId) {
      set({
        globalOpen: true,
        view: 'new',
        conversationId: null,
        title: NEW_CONVERSATION_TITLE,
      })
      return
    }
    if (!current.globalOpen) {
      set({ globalOpen: true })
    }
  },
  setHistoryRailCollapsed: (collapsed) => set({ historyRailCollapsed: collapsed }),
}))
