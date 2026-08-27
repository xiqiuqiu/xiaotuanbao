import { create } from 'zustand'
import type { AiConversationEventView } from '@xiaotuanbao/shared'
import {
  pruneSessionReasoning,
  shouldProjectLiveAssistant,
  type LiveAssistantSnapshot,
} from '@/features/ai-assist/ai-create-copilot-messages'

export type AgentConversationRuntime = {
  conversationId: string | null
  events: AiConversationEventView[]
  draft: string
  draftEpoch: number
  revision: number
  pendingText: string | null
  sending: boolean
  sendIdempotencyKey: string | null
  liveAssistant: LiveAssistantSnapshot | null
  sessionReasoning: Record<string, string>
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
  liveAssistant: null,
  sessionReasoning: {},
}

interface AgentConversationRuntimeState extends AgentConversationRuntime {
  hydrate: (next: Partial<AgentConversationRuntime> & { conversationId: string | null }) => void
  acceptLiveAssistant: (snapshot: LiveAssistantSnapshot) => void
  resetIfConversationChanged: (conversationId: string | null) => void
  clear: () => void
}

function shouldAcceptLiveAssistant(
  current: LiveAssistantSnapshot | null,
  next: LiveAssistantSnapshot,
): boolean {
  if (!current) {
    return true
  }
  if (next.generation < current.generation) {
    return false
  }
  if (next.attemptId === current.attemptId && next.revision <= current.revision) {
    return false
  }
  return true
}

function liveAfterEvents(
  events: AiConversationEventView[],
  live: LiveAssistantSnapshot | null,
): LiveAssistantSnapshot | null {
  if (!live) {
    return null
  }
  if (!shouldProjectLiveAssistant(events, live)) {
    return null
  }
  return live
}

export const useAgentConversationRuntimeStore = create<AgentConversationRuntimeState>((set, get) => ({
  ...EMPTY_RUNTIME,
  hydrate: (next) => {
    const merged = {
      ...get(),
      ...next,
    }
    const sessionReasoning = pruneSessionReasoning(
      merged.events,
      next.sessionReasoning ?? merged.sessionReasoning,
    )
    set({
      ...merged,
      sessionReasoning,
      liveAssistant:
        next.liveAssistant !== undefined
          ? next.liveAssistant
          : liveAfterEvents(merged.events, merged.liveAssistant),
    })
  },
  acceptLiveAssistant: (snapshot) => {
    const current = get()
    if (!shouldAcceptLiveAssistant(current.liveAssistant, snapshot)) {
      return
    }
    const sessionReasoning = pruneSessionReasoning(
      current.events,
      snapshot.reasoningText
        ? { ...current.sessionReasoning, [snapshot.attemptId]: snapshot.reasoningText }
        : current.sessionReasoning,
    )
    set({
      liveAssistant: liveAfterEvents(current.events, snapshot),
      sessionReasoning,
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
