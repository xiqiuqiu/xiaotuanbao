import { downloadBinary, request, type RequestConfig } from '@/lib/request'
import type {
  AiCreateTaskSummary,
  ConfirmAiCreateTaskDto,
  ConfirmAiReviewPackageDto,
  RejectAiReviewPackageDto,
  DepartureMaterialView,
  DepartureSummary,
  PatchAiReviewPackageDto,
  SaveDepartureCreationDraftDto,
  AiCreateAssistAvailability,
  AiCreateAssistTaskState,
  StartAiCreateAssistSessionDto,
  AiCreateAssistSession,
  AiConversationEventView,
  AiConversationDraftView,
  AiConversationInteractionView,
  AiInputBatchView,
  SendAiConversationMessageResult,
  SaveAiConversationDraftDto,
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

export async function getAiCreateAssistTaskState(
  taskId: string,
): Promise<AiCreateAssistTaskState> {
  return request.get<AiCreateAssistTaskState>(`/ai-create-tasks/${taskId}/assist-state`, {
    silentError: true,
  })
}

export async function startAiCreateAssistSession(
  payload: StartAiCreateAssistSessionDto = {},
): Promise<AiCreateAssistSession> {
  return request.post<AiCreateAssistSession>('/ai-create-tasks/assist-session', payload)
}

export async function sendAiConversationMessage(
  taskId: string,
  conversationId: string,
  payload: {
    text: string
    files?: File[]
    replyToEventId?: string
    interactionId?: string
    interactionVersion?: number
    selectedOptionId?: string
  },
  idempotencyKey: string,
): Promise<SendAiConversationMessageResult> {
  const files = payload.files ?? []
  const reply = {
    replyToEventId: payload.replyToEventId,
    interactionId: payload.interactionId,
    interactionVersion: payload.interactionVersion,
    selectedOptionId: payload.selectedOptionId,
  }
  if (files.length > 0) {
    const form = new FormData()
    form.append('text', payload.text)
    if (reply.replyToEventId) form.append('replyToEventId', reply.replyToEventId)
    if (reply.interactionId) form.append('interactionId', reply.interactionId)
    if (reply.interactionVersion != null) {
      form.append('interactionVersion', String(reply.interactionVersion))
    }
    if (reply.selectedOptionId) form.append('selectedOptionId', reply.selectedOptionId)
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
    { text: payload.text, ...reply },
    {
      silentError: true,
      headers: { 'Idempotency-Key': idempotencyKey },
    },
  )
}

export async function saveAiConversationDraft(
  taskId: string,
  conversationId: string,
  payload: SaveAiConversationDraftDto,
  config?: RequestConfig,
): Promise<AiConversationDraftView> {
  return request.put<AiConversationDraftView>(
    `/ai-create-tasks/${taskId}/conversations/${conversationId}/draft`,
    payload,
    { silentError: true, ...config },
  )
}

export async function cancelAiConversationInteraction(
  taskId: string,
  conversationId: string,
  interactionId: string,
  version: number,
  idempotencyKey: string,
): Promise<SendAiConversationMessageResult> {
  return request.post<SendAiConversationMessageResult>(
    `/ai-create-tasks/${taskId}/conversations/${conversationId}/interactions/${interactionId}/cancel`,
    { version },
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

export async function retryFailedConversationBatch(
  taskId: string,
  conversationId: string,
  batchId: string,
  idempotencyKey: string,
): Promise<SendAiConversationMessageResult> {
  return request.post<SendAiConversationMessageResult>(
    `/ai-create-tasks/${taskId}/conversations/${conversationId}/batches/${batchId}/retry`,
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
  pendingInteraction?: AiConversationInteractionView | null
  queuedBatches?: AiInputBatchView[]
  draft?: AiConversationDraftView
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
  payload: RejectAiReviewPackageDto,
): Promise<AiCreateTaskSummary> {
  return request.post<AiCreateTaskSummary>(
    `/ai-create-tasks/${taskId}/review-packages/${packageId}/reject`,
    payload,
  )
}
