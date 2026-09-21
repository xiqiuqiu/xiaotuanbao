import { downloadBinary, request, type RequestConfig } from '@/lib/request'
import type {
  AiCreateTaskSummary,
  ConfirmAiCreateTaskDto,
  CancelAiReviewPackageDto,
  ConfirmAiReviewPackageDto,
  RejectAiReviewPackageDto,
  DepartureMaterialView,
  DepartureSummary,
  PatchAiReviewPackageDto,
  AcceptReviewConfirmationDto,
  ReviewConfirmationView,
  DepartureCollaborationView,
  SaveDepartureCreationDraftDto,
  AiCreateAssistAvailability,
  AiCreateAssistTaskState,
  ConversationSourceView,
} from '@/types/api'

export async function saveDepartureCreationDraft(
  payload: SaveDepartureCreationDraftDto,
  config?: RequestConfig,
): Promise<AiCreateTaskSummary> {
  return request.post<AiCreateTaskSummary>('/ai-create-tasks/draft', payload, config)
}

export async function getAiCreateTask(taskId: string, config?: RequestConfig): Promise<AiCreateTaskSummary> {
  return request.get<AiCreateTaskSummary>(`/agent/tasks/${taskId}`, config)
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
  return request.get<AiCreateAssistTaskState>(`/agent/tasks/${taskId}/runtime-state`, {
    silentError: true,
  })
}

export async function listDepartureMaterials(
  conversationId: string,
): Promise<DepartureMaterialView[]> {
  const sources = await request.get<ConversationSourceView[]>(
    `/agent/conversations/${conversationId}/sources`,
  )
  return sources.map((source) => ({
    id: source.id,
    originalFilename: source.originalFilename,
    contentType: source.contentType,
    status: source.status,
    statusVersion: source.statusVersion,
    sha256: source.sha256,
    sizeBytes: source.sizeBytes,
    createdAt: source.createdAt,
    latestResultVersion: source.latestParseVersion,
    userMessageSequences: source.userMessageSequences,
  }))
}

export async function previewDepartureMaterial(
  conversationId: string,
  materialId: string,
): Promise<{ blob: Blob; filename: string | null }> {
  return downloadBinary(`/agent/conversations/${conversationId}/sources/${materialId}/preview`)
}

export async function listDepartureCollaboration(
  departureId: string,
  conversationId?: string,
): Promise<DepartureCollaborationView> {
  return request.get<DepartureCollaborationView>(`/agent/departures/${departureId}/collaboration`, {
    params: conversationId ? { conversationId } : undefined,
  })
}

export async function acceptReviewConfirmation(
  payload: AcceptReviewConfirmationDto,
): Promise<ReviewConfirmationView> {
  return request.post<ReviewConfirmationView>('/agent/review-decisions', payload)
}

export async function getReviewConfirmation(
  decisionCommandId: string,
): Promise<ReviewConfirmationView> {
  return request.get<ReviewConfirmationView>(`/agent/review-decisions/${decisionCommandId}`)
}

export async function patchAiReviewPackage(
  _taskId: string,
  packageId: string,
  payload: PatchAiReviewPackageDto,
): Promise<AiCreateTaskSummary> {
  return request.patch<AiCreateTaskSummary>(`/agent/review-packages/${packageId}`, payload)
}

export async function confirmAiReviewPackage(
  _taskId: string,
  packageId: string,
  payload: ConfirmAiReviewPackageDto,
  idempotencyKey: string,
): Promise<AiCreateTaskSummary> {
  return request.post<AiCreateTaskSummary>(`/agent/review-packages/${packageId}/confirm`, payload, {
    headers: { 'Idempotency-Key': idempotencyKey },
  })
}

export async function rejectAiReviewPackage(
  _taskId: string,
  packageId: string,
  payload: RejectAiReviewPackageDto,
): Promise<AiCreateTaskSummary> {
  return request.post<AiCreateTaskSummary>(`/agent/review-packages/${packageId}/reject`, payload)
}

export async function cancelAiReviewPackage(
  _taskId: string,
  packageId: string,
  payload: CancelAiReviewPackageDto,
  config?: RequestConfig,
): Promise<AiCreateTaskSummary> {
  return request.post<AiCreateTaskSummary>(`/agent/review-packages/${packageId}/cancel`, payload, config)
}

export async function regenerateAiReviewPackage(
  _taskId: string,
  packageId: string,
): Promise<AiCreateTaskSummary> {
  return request.post<AiCreateTaskSummary>(`/agent/review-packages/${packageId}/regenerate`)
}
