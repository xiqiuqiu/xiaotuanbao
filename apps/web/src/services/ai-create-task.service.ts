import { downloadBinary, request, type RequestConfig } from '@/lib/request'
import type {
  AiCreateTaskSummary,
  ConfirmAiCreateTaskDto,
  ConfirmAiReviewPackageDto,
  DepartureMaterialView,
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
  payload: { text: string; files?: File[] },
  idempotencyKey: string,
): Promise<SendAiConversationMessageResult> {
  const files = payload.files ?? []
  if (files.length > 0) {
    const form = new FormData()
    form.append('text', payload.text)
    for (const file of files) {
      form.append('files', file)
    }
    return request.post<SendAiConversationMessageResult>(
      `/ai-create-tasks/${taskId}/conversations/${conversationId}/messages`,
      form,
      {
        silentError: true,
        headers: { 'Idempotency-Key': idempotencyKey, 'Content-Type': 'multipart/form-data' },
      },
    )
  }
  return request.post<SendAiConversationMessageResult>(
    `/ai-create-tasks/${taskId}/conversations/${conversationId}/messages`,
    { text: payload.text },
    {
      silentError: true,
      headers: { 'Idempotency-Key': idempotencyKey },
    },
  )
}

export async function retryFailedConversationMaterials(
  taskId: string,
  conversationId: string,
  batchId: string,
  materialIds: string[] | undefined,
  idempotencyKey: string,
): Promise<SendAiConversationMessageResult> {
  return request.post<SendAiConversationMessageResult>(
    `/ai-create-tasks/${taskId}/conversations/${conversationId}/batches/${batchId}/retry-failed-materials`,
    materialIds ? { materialIds } : {},
    {
      silentError: true,
      headers: { 'Idempotency-Key': idempotencyKey },
    },
  )
}

export async function removeConversationMaterials(
  taskId: string,
  conversationId: string,
  batchId: string,
  materialIds: string[],
  idempotencyKey: string,
): Promise<SendAiConversationMessageResult> {
  return request.post<SendAiConversationMessageResult>(
    `/ai-create-tasks/${taskId}/conversations/${conversationId}/batches/${batchId}/remove-materials`,
    { materialIds },
    {
      silentError: true,
      headers: { 'Idempotency-Key': idempotencyKey },
    },
  )
}

export async function abandonConversationBatch(
  taskId: string,
  conversationId: string,
  batchId: string,
  idempotencyKey: string,
): Promise<SendAiConversationMessageResult> {
  return request.post<SendAiConversationMessageResult>(
    `/ai-create-tasks/${taskId}/conversations/${conversationId}/batches/${batchId}/abandon`,
    {},
    {
      silentError: true,
      headers: { 'Idempotency-Key': idempotencyKey },
    },
  )
}

export async function stopConversationBatch(
  taskId: string,
  conversationId: string,
  batchId: string,
  idempotencyKey: string,
): Promise<SendAiConversationMessageResult> {
  return request.post<SendAiConversationMessageResult>(
    `/ai-create-tasks/${taskId}/conversations/${conversationId}/batches/${batchId}/stop`,
    {},
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

export async function listDepartureMaterials(taskId: string): Promise<DepartureMaterialView[]> {
  return request.get<DepartureMaterialView[]>(`/ai-create-tasks/${taskId}/materials`)
}

export async function previewDepartureMaterial(
  taskId: string,
  materialId: string,
): Promise<{ blob: Blob; filename: string | null }> {
  return downloadBinary(`/ai-create-tasks/${taskId}/materials/${materialId}/preview`)
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
