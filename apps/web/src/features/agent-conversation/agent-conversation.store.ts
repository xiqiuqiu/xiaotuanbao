import { create } from 'zustand'

const NEW_CONVERSATION_TITLE = '新会话'

export type AgentConversationView = 'page' | 'history' | 'new'

interface AgentConversationState {
  view: AgentConversationView
  conversationId: string | null
  title: string
  selectConversation: (conversation: { id: string; title: string }) => void
  startNewConversation: () => void
}

export const useAgentConversationStore = create<AgentConversationState>((set) => ({
  view: 'page',
  conversationId: null,
  title: NEW_CONVERSATION_TITLE,
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
}))
