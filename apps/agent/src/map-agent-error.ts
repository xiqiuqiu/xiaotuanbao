import { AiCollaborationError, type AiCollaborationErrorCode } from '@xiaotuanbao/ai-contracts'
import { isTokenLimiterTripWire } from './capacity-tripwire'

export function mapAgentFetchError(payload: unknown, httpStatus?: number): AiCollaborationError {
  if (payload && typeof payload === 'object' && 'code' in payload) {
    const code = (payload as { code?: string }).code
    if (isCollaborationCode(code)) {
      return AiCollaborationError.fromCode(code)
    }
  }

  const status = httpStatus ?? (payload && typeof payload === 'object' && 'status' in payload
    ? (payload as { status?: number }).status : undefined)
  if (status != null) {
    if (status === 400 || status === 404 || status === 422) {
      return new AiCollaborationError('INVALID_FORMAT', '工具请求的参数、资料或解析版本无效，请核对后重试')
    }
    if (status === 409) {
      return AiCollaborationError.fromCode('VERSION_CONFLICT')
    }
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

  if (isTokenLimiterTripWire(error)) {
    return AiCollaborationError.fromCode('CONTEXT_CAPACITY_EXCEEDED')
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

function isCollaborationCode(code: unknown): code is AiCollaborationErrorCode {
  return (
    code === 'AGENT_UNAVAILABLE' ||
    code === 'MODEL_TIMEOUT' ||
    code === 'MODEL_REFUSED' ||
    code === 'INVALID_FORMAT' ||
    code === 'PERMISSION_DENIED' ||
    code === 'DELEGATION_INVALID' ||
    code === 'SERVICE_IDENTITY_INVALID' ||
    code === 'VERSION_CONFLICT' ||
    code === 'REVIEW_PENDING' ||
    code === 'CONTEXT_CAPACITY_EXCEEDED'
  )
}
