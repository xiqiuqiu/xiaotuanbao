import { create } from 'zustand'
import type { AiConversationEventView } from '@xiaotuanbao/shared'

export type AgentConversationRuntime = {
  conversationId: string | null
  events: AiConversationEventView[]
  draft: string
  draftEpoch: number
  revision: number
  pendingText: string | null
  sending: boolean
  sendIdempotencyKey: string | null
}

const EMPTY_RUNTIME: AgentConversationRuntime = {
  conversationId: null,
  events: [],
  draft: '',
  draftEpoch: 0,
  revision: 0,
  pendingText: null,
  sending: false,
  sendIdempotencyKey: null,
}

interface AgentConversationRuntimeState extends AgentConversationRuntime {
  hydrate: (next: Partial<AgentConversationRuntime> & { conversationId: string | null }) => void
  resetIfConversationChanged: (conversationId: string | null) => void
  clear: () => void
}

export const useAgentConversationRuntimeStore = create<AgentConversationRuntimeState>((set, get) => ({
  ...EMPTY_RUNTIME,
  hydrate: (next) => {
    set({
      ...get(),
      ...next,
    })
  },
  resetIfConversationChanged: (conversationId) => {
    if (get().conversationId === conversationId) {
      return
    }
    set({
      ...EMPTY_RUNTIME,
      conversationId,
    })
  },
  clear: () => set({ ...EMPTY_RUNTIME }),
}))
