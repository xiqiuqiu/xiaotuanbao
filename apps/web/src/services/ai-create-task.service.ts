import { request, type RequestConfig } from '@/lib/request'
import { downloadBinary, type BinaryDownload } from '@/lib/request'
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

export async function uploadDepartureMaterial(
  taskId: string,
  file: File,
): Promise<DepartureMaterialView> {
  const form = new FormData()
  form.append('file', file)
  return request.post<DepartureMaterialView>(`/ai-create-tasks/${taskId}/materials`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120_000,
  })
}

export async function downloadDepartureMaterialPreview(
  taskId: string,
  materialId: string,
): Promise<BinaryDownload> {
  return downloadBinary(`/ai-create-tasks/${taskId}/materials/${materialId}/preview`)
}
