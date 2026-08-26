import { HttpException, HttpStatus } from '@nestjs/common'
import {
  AiCollaborationError,
  type AiCollaborationErrorCode,
} from '@xiaotuanbao/ai-contracts'

const STATUS_BY_CODE: Record<AiCollaborationErrorCode, HttpStatus> = {
  AGENT_UNAVAILABLE: HttpStatus.SERVICE_UNAVAILABLE,
  MODEL_TIMEOUT: HttpStatus.GATEWAY_TIMEOUT,
  MODEL_REFUSED: HttpStatus.UNPROCESSABLE_ENTITY,
  INVALID_FORMAT: HttpStatus.UNPROCESSABLE_ENTITY,
  PERMISSION_DENIED: HttpStatus.FORBIDDEN,
  DELEGATION_INVALID: HttpStatus.UNAUTHORIZED,
  SERVICE_IDENTITY_INVALID: HttpStatus.UNAUTHORIZED,
  VERSION_CONFLICT: HttpStatus.CONFLICT,
  REVIEW_PENDING: HttpStatus.CONFLICT,
  CONTEXT_CAPACITY_EXCEEDED: HttpStatus.UNPROCESSABLE_ENTITY,
}

export class AiCollaborationHttpException extends HttpException {
  constructor(error: AiCollaborationError) {
    super(
      {
        message: error.message,
        data: error.toJSON(),
      },
      STATUS_BY_CODE[error.code],
    )
  }

  static fromCode(code: AiCollaborationErrorCode): AiCollaborationHttpException {
    return new AiCollaborationHttpException(AiCollaborationError.fromCode(code))
  }
}
