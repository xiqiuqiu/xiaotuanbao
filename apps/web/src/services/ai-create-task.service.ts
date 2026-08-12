import { request } from '@/lib/request'
import type {
  AiCreateTaskSummary,
  ConfirmAiCreateTaskDto,
  DepartureSummary,
  SaveDepartureCreationDraftDto,
} from '@/types/api'

export async function saveDepartureCreationDraft(
  payload: SaveDepartureCreationDraftDto,
): Promise<AiCreateTaskSummary> {
  return request.post<AiCreateTaskSummary>('/ai-create-tasks/draft', payload)
}

export async function getAiCreateTask(taskId: string): Promise<AiCreateTaskSummary> {
  return request.get<AiCreateTaskSummary>(`/ai-create-tasks/${taskId}`)
}

export async function confirmAiCreateTask(
  taskId: string,
  payload: ConfirmAiCreateTaskDto,
  idempotencyKey: string,
): Promise<DepartureSummary> {
  return request.post<DepartureSummary>(`/ai-create-tasks/${taskId}/confirm`, payload, {
    headers: { 'Idempotency-Key': idempotencyKey },
  })
}
