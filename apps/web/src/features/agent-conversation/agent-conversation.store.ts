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
  selectConversation: (conversation: { id: string; title: string }) => void
  startNewConversation: () => void
  expandToGlobal: (location: {
    pathname: string
    search?: string
    searchStr?: string
    hash?: string
  }) => { conversationId: string | null; href: string }
  exitGlobal: () => AgentReturnLocation
  setHistoryRailCollapsed: (collapsed: boolean) => void
}

export const useAgentConversationStore = create<AgentConversationState>((set, get) => ({
  view: 'page',
  conversationId: null,
  title: NEW_CONVERSATION_TITLE,
  returnLocation: null,
  historyRailCollapsed: false,
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
      set({ returnLocation: captured })
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
    set({ returnLocation: null })
    return restored
  },
  setHistoryRailCollapsed: (collapsed) => set({ historyRailCollapsed: collapsed }),
}))
