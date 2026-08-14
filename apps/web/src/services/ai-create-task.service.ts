import { request, type RequestConfig } from '@/lib/request'
import type {
  AiCreateTaskSummary,
  ConfirmAiCreateTaskDto,
  ConfirmAiReviewPackageDto,
  DepartureSummary,
  PatchAiReviewPackageDto,
  SaveDepartureCreationDraftDto,
  AiCreateAssistAvailability,
  StartAiCreateAssistSessionDto,
  AiCreateAssistSession,
  AiConversationEventView,
  AiInputBatchView,
  SendAiConversationMessageResult,
} from '@/types/api'

export async function saveDepartureCreationDraft(
  payload: SaveDepartureCreationDraftDto,
  config?: RequestConfig,
): Promise<AiCreateTaskSummary> {
  return request.post<AiCreateTaskSummary>('/ai-create-tasks/draft', payload, config)
}

export async function getAiCreateTask(taskId: string): Promise<AiCreateTaskSummary> {
  return request.get<AiCreateTaskSummary>(`/ai-create-tasks/${taskId}`)
}

export async function confirmAiCreateTask(
  taskId: string,
  payload: ConfirmAiCreateTaskDto,
  idempotencyKey: string,
  config?: RequestConfig,
): Promise<DepartureSummary> {
  return request.post<DepartureSummary>(`/ai-create-tasks/${taskId}/confirm`, payload, {
    ...config,
    headers: { ...config?.headers, 'Idempotency-Key': idempotencyKey },
  })
}

export async function getAiCreateAssistAvailability(): Promise<AiCreateAssistAvailability> {
  return request.get<AiCreateAssistAvailability>('/ai-create-tasks/assist-availability')
}

export async function startAiCreateAssistSession(
  payload: StartAiCreateAssistSessionDto = {},
): Promise<AiCreateAssistSession> {
  return request.post<AiCreateAssistSession>('/ai-create-tasks/assist-session', payload)
}

export async function sendAiConversationMessage(
  taskId: string,
  conversationId: string,
  payload: { text: string },
  idempotencyKey: string,
): Promise<SendAiConversationMessageResult> {
  return request.post<SendAiConversationMessageResult>(
    `/ai-create-tasks/${taskId}/conversations/${conversationId}/messages`,
    payload,
    {
      silentError: true,
      headers: { 'Idempotency-Key': idempotencyKey },
    },
  )
}

export async function listAiConversationEvents(
  taskId: string,
  conversationId: string,
  afterSequence = 0,
  config?: RequestConfig,
): Promise<{
  conversationId: string
  events: AiConversationEventView[]
  lastSequence: number
  activeBatch: AiInputBatchView | null
}> {
  return request.get(
    `/ai-create-tasks/${taskId}/conversations/${conversationId}/events`,
    { ...config, params: { afterSequence, ...config?.params } },
  )
}

export async function patchAiReviewPackage(
  taskId: string,
  packageId: string,
  payload: PatchAiReviewPackageDto,
): Promise<AiCreateTaskSummary> {
  return request.patch<AiCreateTaskSummary>(
    `/ai-create-tasks/${taskId}/review-packages/${packageId}`,
    payload,
  )
}

export async function confirmAiReviewPackage(
  taskId: string,
  packageId: string,
  payload: ConfirmAiReviewPackageDto,
): Promise<AiCreateTaskSummary> {
  return request.post<AiCreateTaskSummary>(
    `/ai-create-tasks/${taskId}/review-packages/${packageId}/confirm`,
    payload,
  )
}

export async function rejectAiReviewPackage(
  taskId: string,
  packageId: string,
): Promise<AiCreateTaskSummary> {
  return request.post<AiCreateTaskSummary>(
    `/ai-create-tasks/${taskId}/review-packages/${packageId}/reject`,
  )
}
