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
import { parsePageLocator } from '@xiaotuanbao/shared'

export const NEW_CONVERSATION_TITLE = '新会话'

export type AgentConversationView = 'page' | 'history' | 'new'

const PAGE_CONTEXT_STORAGE_KEY = 'agent-conversation-page-context'

function samePageAttachment(
  left: AgentCurrentPageAttachment | null,
  right: AgentCurrentPageAttachment | null,
): boolean {
  if (!left || !right || left.kind !== right.kind) {
    return left === right
  }
  if (left.kind === 'page_locator' && right.kind === 'page_locator') {
    return (
      left.locator.kind === right.locator.kind &&
      left.locator.objectId === right.locator.objectId &&
      left.locator.section === right.locator.section
    )
  }
  return (
    left.kind === 'agent_task' &&
    right.kind === 'agent_task' &&
    left.taskType === right.taskType &&
    left.taskId === right.taskId
  )
}

function persistPageContext(state: Pick<
  AgentConversationState,
  'conversationId' | 'attachedPageAttachment' | 'pageContextDismissed'
>) {
  sessionStorage.setItem(
    PAGE_CONTEXT_STORAGE_KEY,
    JSON.stringify({
      conversationId: state.conversationId,
      attachment: state.attachedPageAttachment,
      dismissed: state.pageContextDismissed,
    }),
  )
}

function readPersistedPageContext(conversationId: string | null): {
  attachment: AgentCurrentPageAttachment | null
  dismissed: boolean
} | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(PAGE_CONTEXT_STORAGE_KEY) ?? 'null') as {
      conversationId?: unknown
      attachment?: unknown
      dismissed?: unknown
    } | null
    if (!value || value.conversationId !== conversationId || typeof value.dismissed !== 'boolean') {
      return null
    }
    const attachment = value.attachment as Partial<AgentCurrentPageAttachment> | null
    if (attachment === null) {
      return { attachment: null, dismissed: value.dismissed }
    }
    if (attachment?.kind === 'page_locator') {
      const locator = parsePageLocator(attachment.locator)
      if (!locator) return null
      return {
        attachment: {
          kind: 'page_locator',
          locator,
          ...(typeof attachment.objectLabel === 'string'
            ? { objectLabel: attachment.objectLabel }
            : {}),
        },
        dismissed: value.dismissed,
      }
    }
    if (
      attachment?.kind === 'agent_task' &&
      typeof attachment.taskType === 'string' &&
      typeof attachment.taskId === 'string'
    ) {
      return {
        attachment: attachment as AgentCurrentPageAttachment,
        dismissed: value.dismissed,
      }
    }
  } catch {
    return null
  }
  return null
}

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
  pageAttachmentSynced: boolean
  observedPageAttachment: AgentCurrentPageAttachment | null
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
  pageAttachmentSynced: false,
  observedPageAttachment: null as AgentCurrentPageAttachment | null,
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
    persistPageContext(get())
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
    persistPageContext(get())
  },
  startNewConversation: (currentAttachment) => {
    persistSelectedConversation(null)
    sessionStorage.removeItem('conversation-pending-draft:new')
    set({
      view: 'new',
      conversationId: null,
      title: NEW_CONVERSATION_TITLE,
      attachedPageAttachment: nextPageAttachment({
        view: 'new',
        currentAttachment: currentAttachment ?? null,
        captured: false,
      }),
      pageContextDismissed: false,
      pageAttachmentSynced: currentAttachment !== undefined,
      observedPageAttachment: currentAttachment ?? null,
      composerEpoch: get().composerEpoch + 1,
    })
    persistPageContext(get())
  },
  attachCurrentPage: (currentAttachment) => {
    set({
      attachedPageAttachment: nextPageAttachment({
        view: get().view,
        currentAttachment,
        captured: true,
      }),
      pageContextDismissed: false,
      pageAttachmentSynced: true,
      observedPageAttachment: currentAttachment,
    })
    persistPageContext(get())
  },
  detachCurrentPage: () => {
    set({ attachedPageAttachment: null, pageContextDismissed: true })
    persistPageContext(get())
  },
  syncDefaultPageAttachment: (currentAttachment) => {
    const current = get()
    if (!current.pageAttachmentSynced) {
      const attachmentMatches = samePageAttachment(
        current.attachedPageAttachment,
        currentAttachment,
      )
      set({
        pageAttachmentSynced: true,
        observedPageAttachment: currentAttachment,
        attachedPageAttachment: attachmentMatches
          ? currentAttachment
          : current.attachedPageAttachment
            ? null
            : current.view === 'history' || current.pageContextDismissed
              ? null
              : currentAttachment,
        pageContextDismissed:
          current.attachedPageAttachment && !attachmentMatches
            ? true
            : current.pageContextDismissed,
      })
      persistPageContext(get())
      return
    }
    if (!samePageAttachment(current.observedPageAttachment, currentAttachment)) {
      set({
        observedPageAttachment: currentAttachment,
        attachedPageAttachment: null,
        pageContextDismissed: true,
      })
      persistPageContext(get())
      return
    }
    if (
      current.attachedPageAttachment &&
      currentAttachment &&
      current.attachedPageAttachment.kind === 'page_locator' &&
      currentAttachment.kind === 'page_locator' &&
      samePageAttachment(current.attachedPageAttachment, currentAttachment) &&
      current.attachedPageAttachment.objectLabel !== currentAttachment.objectLabel
    ) {
      set({ attachedPageAttachment: currentAttachment })
      persistPageContext(get())
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
    const persistedPageContext = readPersistedPageContext(stored?.conversationId ?? null)
    if (!stored) {
      if (persistedPageContext) {
        set({
          attachedPageAttachment: persistedPageContext.attachment,
          pageContextDismissed: persistedPageContext.dismissed,
          pageAttachmentSynced: false,
        })
      }
      return
    }
    set({
      view: 'history',
      conversationId: stored.conversationId,
      title: stored.title || NEW_CONVERSATION_TITLE,
      attachedPageAttachment: persistedPageContext?.attachment ?? null,
      pageContextDismissed: persistedPageContext?.dismissed ?? false,
      pageAttachmentSynced: false,
    })
  },
  reset: () => {
    persistReturnLocation(null)
    persistSelectedConversation(null)
    sessionStorage.removeItem(PAGE_CONTEXT_STORAGE_KEY)
    sessionStorage.removeItem('conversation-pending-draft:new')
    set({ ...INITIAL_CONVERSATION_STATE })
  },
}))
