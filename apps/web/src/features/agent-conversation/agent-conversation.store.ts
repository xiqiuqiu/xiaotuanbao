import { create } from 'zustand'
import {
  agentConversationPath,
  captureReturnLocation,
  fallbackReturnLocation,
  persistReturnLocation,
  persistSelectedConversation,
  readPersistedReturnLocation,
  readPersistedSelectedConversation,
  type AgentReturnLocation,
} from './agent-conversation-location'
import {
  nextPageAttachment,
  type AgentCurrentPageAttachment,
} from './page-locator-attachment'

export const NEW_CONVERSATION_TITLE = '新会话'

export type AgentConversationView = 'page' | 'history' | 'new'

interface AgentConversationState {
  view: AgentConversationView
  conversationId: string | null
  title: string
  returnLocation: AgentReturnLocation | null
  historyRailCollapsed: boolean
  globalOpen: boolean
  attachedPageAttachment: AgentCurrentPageAttachment | null
  persistConversation: (conversation: { id: string; title: string }) => void
  openHistoricalConversation: (conversation: { id: string; title: string }) => void
  startNewConversation: (currentAttachment?: AgentCurrentPageAttachment | null) => void
  pageContextDismissed: boolean
  composerEpoch: number
  attachCurrentPage: (currentAttachment: AgentCurrentPageAttachment | null) => void
  detachCurrentPage: () => void
  syncDefaultPageAttachment: (currentAttachment: AgentCurrentPageAttachment | null) => void
  expandToGlobal: (location: {
    pathname: string
    search?: string
    searchStr?: string
    hash?: string
  }) => { conversationId: string | null; href: string }
  exitGlobal: () => AgentReturnLocation
  closeGlobalForBusinessNavigation: () => void
  openGlobalFromRoute: (conversationId: string | null) => void
  setHistoryRailCollapsed: (collapsed: boolean) => void
  hydrateFromSession: () => void
  reset: () => void
}

const INITIAL_CONVERSATION_STATE = {
  view: 'page' as AgentConversationView,
  conversationId: null as string | null,
  title: NEW_CONVERSATION_TITLE,
  returnLocation: null as AgentReturnLocation | null,
  historyRailCollapsed: false,
  globalOpen: false,
  attachedPageAttachment: null as AgentCurrentPageAttachment | null,
  pageContextDismissed: false,
  composerEpoch: 0,
}

export const useAgentConversationStore = create<AgentConversationState>((set, get) => ({
  ...INITIAL_CONVERSATION_STATE,
  persistConversation: (conversation) => {
    persistSelectedConversation({
      conversationId: conversation.id,
      title: conversation.title || NEW_CONVERSATION_TITLE,
    })
    set({
      conversationId: conversation.id,
      title: conversation.title || NEW_CONVERSATION_TITLE,
    })
  },
  openHistoricalConversation: (conversation) => {
    const current = get()
    const reopeningCurrentHistory =
      current.view === 'history' && current.conversationId === conversation.id
    persistSelectedConversation({
      conversationId: conversation.id,
      title: conversation.title || NEW_CONVERSATION_TITLE,
    })
    set({
      view: 'history',
      conversationId: conversation.id,
      title: conversation.title || NEW_CONVERSATION_TITLE,
      attachedPageAttachment: reopeningCurrentHistory ? current.attachedPageAttachment : null,
      pageContextDismissed: false,
    })
  },
  startNewConversation: (currentAttachment = null) => {
    persistSelectedConversation(null)
    set({
      view: 'new',
      conversationId: null,
      title: NEW_CONVERSATION_TITLE,
      attachedPageAttachment: nextPageAttachment({
        view: 'new',
        currentAttachment,
        captured: false,
      }),
      pageContextDismissed: false,
      composerEpoch: get().composerEpoch + 1,
    })
  },
  attachCurrentPage: (currentAttachment) =>
    set({
      attachedPageAttachment: nextPageAttachment({
        view: get().view,
        currentAttachment,
        captured: true,
      }),
      pageContextDismissed: false,
    }),
  detachCurrentPage: () => set({ attachedPageAttachment: null, pageContextDismissed: true }),
  syncDefaultPageAttachment: (currentAttachment) => {
    const current = get()
    if (current.view === 'history' || current.pageContextDismissed) {
      return
    }
    const next = nextPageAttachment({
      view: current.view === 'page' ? 'new' : current.view,
      currentAttachment,
      captured: false,
    })
    if (next && !current.attachedPageAttachment) {
      set({ attachedPageAttachment: next })
    }
  },
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
  closeGlobalForBusinessNavigation: () => {
    persistReturnLocation(null)
    set({ returnLocation: null, globalOpen: false })
  },
  openGlobalFromRoute: (conversationId) => {
    const current = get()
    if (conversationId && conversationId !== current.conversationId) {
      set({
        globalOpen: true,
        view: 'history',
        conversationId,
        title: current.title || NEW_CONVERSATION_TITLE,
        attachedPageAttachment: nextPageAttachment({
          view: 'history',
          currentAttachment: null,
          captured: false,
        }),
        pageContextDismissed: false,
      })
      return
    }
    if (!conversationId && current.conversationId) {
      set({
        globalOpen: true,
        view: 'new',
        conversationId: null,
        title: NEW_CONVERSATION_TITLE,
        attachedPageAttachment: current.attachedPageAttachment,
      })
      return
    }
    if (!current.globalOpen) {
      set({ globalOpen: true })
    }
  },
  setHistoryRailCollapsed: (collapsed) => set({ historyRailCollapsed: collapsed }),
  hydrateFromSession: () => {
    const stored = readPersistedSelectedConversation()
    if (!stored) {
      return
    }
    set({
      view: 'history',
      conversationId: stored.conversationId,
      title: stored.title || NEW_CONVERSATION_TITLE,
    })
  },
  reset: () => {
    persistReturnLocation(null)
    persistSelectedConversation(null)
    set({ ...INITIAL_CONVERSATION_STATE })
  },
}))
