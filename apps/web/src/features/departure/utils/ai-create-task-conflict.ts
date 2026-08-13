import type { AiCreateTaskSummary } from '@xiaotuanbao/shared'
import { ApiError } from '@/lib/request'

export function readAiCreateTaskConflict(error: unknown): AiCreateTaskSummary | null {
  if (!(error instanceof ApiError) || error.code !== 409 || error.data == null) {
    return null
  }
  const data = error.data
  if (typeof data !== 'object' || !('id' in data) || !('draft' in data)) {
    return null
  }
  const draft = (data as AiCreateTaskSummary).draft
  if (!draft || typeof draft.version !== 'number') {
    return null
  }
  return data as AiCreateTaskSummary
}
