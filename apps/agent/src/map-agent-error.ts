import { AiCollaborationError, type AiCollaborationErrorCode } from '@xiaotuanbao/ai-contracts'

export function mapAgentFetchError(payload: unknown): AiCollaborationError {
  if (payload && typeof payload === 'object' && 'code' in payload) {
    const code = (payload as { code?: string }).code
    if (isCollaborationCode(code)) {
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

function isCollaborationCode(code: unknown): code is AiCollaborationErrorCode {
  return (
    code === 'AGENT_UNAVAILABLE' ||
    code === 'MODEL_TIMEOUT' ||
    code === 'MODEL_REFUSED' ||
    code === 'INVALID_FORMAT' ||
    code === 'PERMISSION_DENIED' ||
    code === 'DELEGATION_INVALID' ||
    code === 'SERVICE_IDENTITY_INVALID'
  )
}
