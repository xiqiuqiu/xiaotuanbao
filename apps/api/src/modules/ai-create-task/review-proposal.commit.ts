import type { EvidenceAuthority, EvidenceSystemRuleRegistry } from './evidence-validator'
import {
  validateReviewProposal,
  type ReviewProposalError,
  type ReviewProposalValidationResult,
} from './review-proposal.validator'
import type {
  SubmitReviewPackageModelInput,
  SubmitSourceOrderReviewPackageModelInput,
} from '@xiaotuanbao/ai-contracts'

export class ReviewProposalRejectedError extends Error {
  readonly errors: ReviewProposalError[]

  constructor(errors: ReviewProposalError[]) {
    super('REVIEW_PROPOSAL_INVALID')
    this.name = 'ReviewProposalRejectedError'
    this.errors = errors
  }
}

export function requireValidReviewProposal(input: {
  proposal: {
    objectVersion: number
    confirmationUnit: string
    candidates: SubmitReviewPackageModelInput['candidates'] | SubmitSourceOrderReviewPackageModelInput['candidates']
  }
  authority: EvidenceAuthority
  systemRules?: EvidenceSystemRuleRegistry
}): Extract<ReviewProposalValidationResult, { success: true }> {
  const result = validateReviewProposal(input)
  if (!result.success) {
    throw new ReviewProposalRejectedError(result.errors)
  }
  return result
}
