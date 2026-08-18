import {
  AiCollaborationError,
  isAiCollaborationErrorCode,
} from '@xiaotuanbao/ai-contracts'

export function mapAgentFetchError(payload: unknown): AiCollaborationError {
  if (payload && typeof payload === 'object' && 'code' in payload) {
    const code = (payload as { code?: string }).code
    if (isAiCollaborationErrorCode(code)) {
      return AiCollaborationError.fromCode(code)
    }
  }

  if (payload && typeof payload === 'object' && 'status' in payload) {
    const status = (payload as { status?: number }).status
    if (status === 401 || status === 403) {
      return AiCollaborationError.fromCode('PERMISSION_DENIED')
    }
    if (status === 504) {
      return AiCollaborationError.fromCode('MODEL_TIMEOUT')
    }
  }

  return AiCollaborationError.fromCode('AGENT_UNAVAILABLE')
}

export function mapModelError(error: unknown): AiCollaborationError {
  if (error instanceof AiCollaborationError) {
    return error
  }

  const name = error instanceof Error ? error.name : ''
  const message = error instanceof Error ? error.message : String(error)
  if (name === 'TimeoutError' || name === 'AbortError' || /timeout|aborted/i.test(message)) {
    return AiCollaborationError.fromCode('MODEL_TIMEOUT')
  }
  if (/refus|content.?filter|safety|policy/i.test(message)) {
    return AiCollaborationError.fromCode('MODEL_REFUSED')
  }
  return AiCollaborationError.fromCode('AGENT_UNAVAILABLE')
}

