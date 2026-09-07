import type { EvidenceAuthority, EvidenceSystemRuleRegistry } from './evidence-validator'
import {
  validateReviewProposal,
  type ReviewProposalError,
  type ReviewProposalInput,
  type ReviewProposalValidationResult,
} from './review-proposal.validator'

export class ReviewProposalRejectedError extends Error {
  readonly errors: ReviewProposalError[]

  constructor(errors: ReviewProposalError[]) {
    super('REVIEW_PROPOSAL_INVALID')
    this.name = 'ReviewProposalRejectedError'
    this.errors = errors
  }
}

export function requireValidReviewProposal(input: {
  proposal: ReviewProposalInput
  authority: EvidenceAuthority
  systemRules?: EvidenceSystemRuleRegistry
}): Extract<ReviewProposalValidationResult, { success: true }> {
  const result = validateReviewProposal(input)
  if (!result.success) {
    throw new ReviewProposalRejectedError(result.errors)
  }
  return result
}
