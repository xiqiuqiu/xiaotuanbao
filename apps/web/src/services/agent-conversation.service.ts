import { request, type RequestConfig } from '@/lib/request'
import type {
  AiConversationDraftView,
  AiConversationEventView,
  AiConversationView,
  ConversationHistoryPage,
  PageLocator,
  SaveAiConversationDraftDto,
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
  draft?: AiConversationDraftView
}> {
  return request.get(`/agent/conversations/${conversationId}/events`, {
    ...config,
    params: { afterSequence, ...config?.params },
  })
}

export async function saveAgentConversationDraft(
  conversationId: string,
  payload: SaveAiConversationDraftDto,
  config?: RequestConfig,
): Promise<AiConversationDraftView> {
  return request.put<AiConversationDraftView>(
    `/agent/conversations/${conversationId}/draft`,
    payload,
    { silentError: true, ...config },
  )
}

export async function sendAgentConversationText(
  conversationId: string | null,
  payload: {
    text: string
    replyToEventId?: string
    interactionId?: string
    interactionVersion?: number
    selectedOptionId?: string
  } & (
    | { pageLocator: PageLocator; primaryTaskId?: never }
    | { primaryTaskId: string; pageLocator?: never }
    | { pageLocator?: never; primaryTaskId?: never }
  ),
  idempotencyKey: string,
): Promise<SendAiConversationMessageResult> {
  const path = conversationId
    ? `/agent/conversations/${conversationId}/messages`
    : '/agent/conversations/messages'
  return request.post<SendAiConversationMessageResult>(
    path,
    {
      text: payload.text,
      ...(payload.replyToEventId ? { replyToEventId: payload.replyToEventId } : {}),
      ...(payload.interactionId ? { interactionId: payload.interactionId } : {}),
      ...(payload.interactionVersion != null
        ? { interactionVersion: payload.interactionVersion }
        : {}),
      ...(payload.selectedOptionId ? { selectedOptionId: payload.selectedOptionId } : {}),
      ...(payload.pageLocator ? { pageLocator: payload.pageLocator } : {}),
      ...(payload.primaryTaskId ? { primaryTaskId: payload.primaryTaskId } : {}),
    },
    {
      silentError: true,
      headers: { 'Idempotency-Key': idempotencyKey },
    },
  )
}

export async function cancelAgentConversationInteraction(
  conversationId: string,
  interactionId: string,
  version: number,
  idempotencyKey: string,
): Promise<SendAiConversationMessageResult> {
  return request.post<SendAiConversationMessageResult>(
    `/agent/conversations/${conversationId}/interactions/${interactionId}/cancel`,
    { version },
    {
      silentError: true,
      headers: { 'Idempotency-Key': idempotencyKey },
    },
  )
}

export async function stopAgentConversationBatch(
  conversationId: string,
  batchId: string,
  idempotencyKey: string,
): Promise<SendAiConversationMessageResult> {
  return request.post<SendAiConversationMessageResult>(
    `/agent/conversations/${conversationId}/batches/${batchId}/stop`,
    {},
    {
      silentError: true,
      headers: { 'Idempotency-Key': idempotencyKey },
    },
  )
}

export async function retractQueuedAgentConversationBatch(
  conversationId: string,
  batchId: string,
  idempotencyKey: string,
): Promise<SendAiConversationMessageResult> {
  return request.post<SendAiConversationMessageResult>(
    `/agent/conversations/${conversationId}/batches/${batchId}/retract`,
    {},
    {
      silentError: true,
      headers: { 'Idempotency-Key': idempotencyKey },
    },
  )
}
