import { create } from 'zustand'
import type { PageLocator } from '@xiaotuanbao/shared'
import {
  agentConversationPath,
  captureReturnLocation,
  fallbackReturnLocation,
  persistReturnLocation,
  readPersistedReturnLocation,
  type AgentReturnLocation,
} from './agent-conversation-location'
import { nextPageLocatorAttachment } from './page-locator-attachment'

export const NEW_CONVERSATION_TITLE = '新会话'

export type AgentConversationView = 'page' | 'history' | 'new'

interface AgentConversationState {
  view: AgentConversationView
  conversationId: string | null
  title: string
  returnLocation: AgentReturnLocation | null
  historyRailCollapsed: boolean
  globalOpen: boolean
  attachedPageLocator: PageLocator | null
  selectConversation: (conversation: { id: string; title: string }) => void
  startNewConversation: (currentLocator?: PageLocator | null) => void
  pageContextDismissed: boolean
  attachCurrentPage: (currentLocator: PageLocator | null) => void
  detachCurrentPage: () => void
  syncDefaultPageLocator: (currentLocator: PageLocator | null) => void
  expandToGlobal: (location: {
    pathname: string
    search?: string
    searchStr?: string
    hash?: string
  }) => { conversationId: string | null; href: string }
  exitGlobal: () => AgentReturnLocation
  openGlobalFromRoute: (conversationId: string | null) => void
  setHistoryRailCollapsed: (collapsed: boolean) => void
  reset: () => void
}

const INITIAL_CONVERSATION_STATE = {
  view: 'page' as AgentConversationView,
  conversationId: null as string | null,
  title: NEW_CONVERSATION_TITLE,
  returnLocation: null as AgentReturnLocation | null,
  historyRailCollapsed: false,
  globalOpen: false,
  attachedPageLocator: null as PageLocator | null,
  pageContextDismissed: false,
}

export const useAgentConversationStore = create<AgentConversationState>((set, get) => ({
  ...INITIAL_CONVERSATION_STATE,
  selectConversation: (conversation) => {
    const current = get()
    const persistingNewConversation = current.conversationId === null && current.view !== 'history'
    const switching = !persistingNewConversation && current.conversationId !== conversation.id
    set({
      view: persistingNewConversation ? current.view : 'history',
      conversationId: conversation.id,
      title: conversation.title || NEW_CONVERSATION_TITLE,
      ...(switching
        ? {
            attachedPageLocator: nextPageLocatorAttachment({
              view: 'history',
              conversationId: conversation.id,
              currentLocator: null,
              attachedLocator: current.attachedPageLocator,
              captured: false,
            }),
            pageContextDismissed: false,
          }
        : {}),
    })
  },
  startNewConversation: (currentLocator = null) =>
    set({
      view: 'new',
      conversationId: null,
      title: NEW_CONVERSATION_TITLE,
      attachedPageLocator: nextPageLocatorAttachment({
        view: 'new',
        conversationId: null,
        currentLocator,
        attachedLocator: null,
        captured: false,
      }),
      pageContextDismissed: false,
    }),
  attachCurrentPage: (currentLocator) =>
    set({
      attachedPageLocator: nextPageLocatorAttachment({
        view: get().view,
        conversationId: get().conversationId,
        currentLocator,
        attachedLocator: get().attachedPageLocator,
        captured: true,
      }),
      pageContextDismissed: false,
    }),
  detachCurrentPage: () => set({ attachedPageLocator: null, pageContextDismissed: true }),
  syncDefaultPageLocator: (currentLocator) => {
    const current = get()
    if (current.conversationId || current.view === 'history' || current.pageContextDismissed) {
      return
    }
    const next = nextPageLocatorAttachment({
      view: current.view === 'page' ? 'new' : current.view,
      conversationId: current.conversationId,
      currentLocator,
      attachedLocator: current.attachedPageLocator,
      captured: false,
    })
    if (next && !current.attachedPageLocator) {
      set({ attachedPageLocator: next })
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
  openGlobalFromRoute: (conversationId) => {
    const current = get()
    if (conversationId && conversationId !== current.conversationId) {
      set({
        globalOpen: true,
        view: 'history',
        conversationId,
        title: current.title || NEW_CONVERSATION_TITLE,
        attachedPageLocator: nextPageLocatorAttachment({
          view: 'history',
          conversationId,
          currentLocator: null,
          attachedLocator: current.attachedPageLocator,
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
        attachedPageLocator: current.attachedPageLocator,
      })
      return
    }
    if (!current.globalOpen) {
      set({ globalOpen: true })
    }
  },
  setHistoryRailCollapsed: (collapsed) => set({ historyRailCollapsed: collapsed }),
  reset: () => {
    persistReturnLocation(null)
    set({ ...INITIAL_CONVERSATION_STATE })
  },
}))
