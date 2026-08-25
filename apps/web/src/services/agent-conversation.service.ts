import { request, type RequestConfig } from '@/lib/request'
import type {
  AiConversationEventView,
  AiConversationView,
  ConversationHistoryPage,
  SendAiConversationMessageResult,
} from '@/types/api'

export async function listAgentConversations(
  query: {
    q?: string
    includeArchived?: boolean
    cursor?: string
    limit?: number
  } = {},
  config?: RequestConfig,
): Promise<ConversationHistoryPage> {
  return request.get<ConversationHistoryPage>('/agent/conversations', {
    ...config,
    params: {
      ...(query.q ? { q: query.q } : {}),
      ...(query.includeArchived ? { includeArchived: true } : {}),
      ...(query.cursor ? { cursor: query.cursor } : {}),
      ...(query.limit ? { limit: query.limit } : {}),
    },
  })
}

export async function getAgentConversation(
  conversationId: string,
  config?: RequestConfig,
): Promise<AiConversationView> {
  return request.get<AiConversationView>(`/agent/conversations/${conversationId}`, config)
}

export async function listAgentConversationEvents(
  conversationId: string,
  afterSequence = 0,
  config?: RequestConfig,
): Promise<{
  conversationId: string
  events: AiConversationEventView[]
  lastSequence: number
}> {
  return request.get(`/agent/conversations/${conversationId}/events`, {
    ...config,
    params: { afterSequence, ...config?.params },
  })
}

export async function sendAgentConversationMessage(
  conversationId: string | null,
  payload: { text: string },
  idempotencyKey: string,
): Promise<SendAiConversationMessageResult> {
  const path = conversationId
    ? `/agent/conversations/${conversationId}/messages`
    : '/agent/conversations/messages'
  return request.post<SendAiConversationMessageResult>(path, { text: payload.text }, {
    silentError: true,
    headers: { 'Idempotency-Key': idempotencyKey },
  })
}
