import { ApiError } from '@/lib/request'

export const ASSIST_ERROR_TEXT = 'AI 辅助暂时不可用，请稍后重试或继续使用表单'

export function getAssistErrorText(error: unknown): string {
  if (error instanceof ApiError && (error.code === 400 || error.code === 413)) {
    return error.message
  }
  return ASSIST_ERROR_TEXT
}
