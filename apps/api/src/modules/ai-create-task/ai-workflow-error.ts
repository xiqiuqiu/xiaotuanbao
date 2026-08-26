import { ServiceUnavailableException } from '@nestjs/common'
import { CONTEXT_CAPACITY_EXCEEDED, CONTEXT_PROFILE_MISSING } from './ai-context-budget'
import { ReviewProposalRejectedError } from './review-proposal.commit'

const TYPED_WORKFLOW_ERROR_CODES = [
  'VERSION_CONFLICT',
  CONTEXT_CAPACITY_EXCEEDED,
  CONTEXT_PROFILE_MISSING,
] as const

export function workflowErrorCode(error: unknown): string {
  if (error instanceof ReviewProposalRejectedError) {
    return 'INVALID_FORMAT'
  }
  if (error instanceof Error) {
    const code = TYPED_WORKFLOW_ERROR_CODES.find(
      (item) => error.message === item || error.message.startsWith(`${item}:`),
    )
    if (code) {
      return code
    }
  }
  if (error instanceof ServiceUnavailableException) {
    return 'AGENT_UNAVAILABLE'
  }
  return 'AGENT_UNAVAILABLE'
}
