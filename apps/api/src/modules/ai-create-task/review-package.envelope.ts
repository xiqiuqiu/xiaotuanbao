import { createHash } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import {
  AI_CREATE_CAPABILITY_REFS_BY_TOOL,
  DEPARTURE_REVIEW_PAYLOAD_SCHEMA,
  DEPARTURE_REVIEW_TARGET_KIND,
  canonicalizeReviewValue,
  type SubmitReviewPackageModelInput,
} from '@xiaotuanbao/ai-contracts'
import { toStoredCandidates } from './review-package.mapper'

export function reviewProposalHash(payload: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalizeReviewValue(payload)))
    .digest('hex')
}

export function departureReviewProposalHash(
  reviewPackage: SubmitReviewPackageModelInput,
): string {
  return reviewProposalHash({
    confirmationUnit: reviewPackage.confirmationUnit,
    candidates: toStoredCandidates(reviewPackage.candidates).map((candidate) => ({
      fieldKey: candidate.fieldKey,
      proposedValue: candidate.proposedValue,
      clarity: candidate.clarity,
      evidence: candidate.evidence,
    })),
  })
}

export function reviewDecisionRequestHash(payload: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalizeReviewValue(payload)))
    .digest('hex')
}

export function reviewPackageCreateData(params: {
  organizationId: string
  taskId: string
  runId: string
  conversationId: string
  inputBatchId: string
  attemptId?: string | null
  sourceActionId: string
  targetId: string
  baseObjectVersion: number
  baselineSnapshot: Prisma.InputJsonValue
  reviewPackage: SubmitReviewPackageModelInput
}): Prisma.AiReviewPackageCreateInput {
  const stored = toStoredCandidates(params.reviewPackage.candidates)
  const capability = AI_CREATE_CAPABILITY_REFS_BY_TOOL.submitReviewPackage
  return {
    organization: { connect: { id: params.organizationId } },
    task: { connect: { id: params.taskId } },
    run: { connect: { id: params.runId } },
    conversation: { connect: { id: params.conversationId } },
    inputBatch: { connect: { id: params.inputBatchId } },
    ...(params.attemptId ? { attempt: { connect: { id: params.attemptId } } } : {}),
    sourceAction: { connect: { id: params.sourceActionId } },
    status: 'pending',
    confirmationUnit: params.reviewPackage.confirmationUnit,
    payloadSchema: DEPARTURE_REVIEW_PAYLOAD_SCHEMA,
    capabilityKey: capability.key,
    capabilityVersion: capability.version,
    targetKind: DEPARTURE_REVIEW_TARGET_KIND,
    targetId: params.targetId,
    proposalHash: departureReviewProposalHash(params.reviewPackage),
    baseObjectVersion: params.baseObjectVersion,
    baselineSnapshot: params.baselineSnapshot,
    candidates: stored as unknown as Prisma.InputJsonValue,
    version: 1,
  }
}
