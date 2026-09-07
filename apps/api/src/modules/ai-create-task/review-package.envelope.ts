import { createHash } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import {
  AI_CREATE_CAPABILITY_REFS_BY_TOOL,
  DEFAULT_REVIEW_ITEM_IDENTITY,
  DEPARTURE_REVIEW_PAYLOAD_SCHEMA,
  DEPARTURE_REVIEW_TARGET_KIND,
  DEPARTURE_SEGMENT_RESOURCE_PROPOSE_CAPABILITY_REF,
  SEGMENT_RESOURCE_CONFIRMATION_UNIT,
  SEGMENT_RESOURCE_REVIEW_PAYLOAD_SCHEMA,
  SOURCE_ORDER_REVIEW_CONFIRMATION_UNIT,
  SOURCE_ORDER_REVIEW_PAYLOAD_SCHEMA,
  canonicalizeReviewValue,
} from '@xiaotuanbao/ai-contracts'
import { toStoredCandidates, type ReviewPackageProposal } from './review-package.mapper'

export function reviewProposalHash(payload: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalizeReviewValue(payload)))
    .digest('hex')
}

export function departureReviewProposalHash(
  reviewPackage: ReviewPackageProposal,
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
  conversationId: string
  inputBatchId: string
  attemptId?: string | null
  sourceActionId: string
  targetKind?: string
  targetId: string
  itemIdentity?: string
  payloadSchema?: string
  baseObjectVersion: number
  baselineSnapshot: Prisma.InputJsonValue
  reviewPackage: ReviewPackageProposal
}): Prisma.AiReviewPackageCreateInput {
  const stored = toStoredCandidates(params.reviewPackage.candidates)
  const capability = capabilityRefForReviewPackage(params.reviewPackage.confirmationUnit)
  return {
    organization: { connect: { id: params.organizationId } },
    task: { connect: { id: params.taskId } },
    conversation: { connect: { id: params.conversationId } },
    inputBatch: { connect: { id: params.inputBatchId } },
    ...(params.attemptId ? { attempt: { connect: { id: params.attemptId } } } : {}),
    sourceAction: { connect: { id: params.sourceActionId } },
    status: 'pending',
    confirmationUnit: params.reviewPackage.confirmationUnit,
    payloadSchema:
      params.payloadSchema ?? payloadSchemaForConfirmationUnit(params.reviewPackage.confirmationUnit),
    capabilityKey: capability.key,
    capabilityVersion: capability.version,
    targetKind: params.targetKind ?? DEPARTURE_REVIEW_TARGET_KIND,
    targetId: params.targetId,
    itemIdentity: params.itemIdentity ?? DEFAULT_REVIEW_ITEM_IDENTITY,
    proposalHash: departureReviewProposalHash(params.reviewPackage),
    baseObjectVersion: params.baseObjectVersion,
    baselineSnapshot: params.baselineSnapshot,
    candidates: stored as unknown as Prisma.InputJsonValue,
    version: 1,
  }
}

function capabilityRefForReviewPackage(confirmationUnit: string) {
  if (confirmationUnit === SEGMENT_RESOURCE_CONFIRMATION_UNIT) {
    return DEPARTURE_SEGMENT_RESOURCE_PROPOSE_CAPABILITY_REF
  }
  return AI_CREATE_CAPABILITY_REFS_BY_TOOL.submitReviewPackage
}

function payloadSchemaForConfirmationUnit(confirmationUnit: string) {
  if (confirmationUnit === SEGMENT_RESOURCE_CONFIRMATION_UNIT) {
    return SEGMENT_RESOURCE_REVIEW_PAYLOAD_SCHEMA
  }
  if (confirmationUnit === SOURCE_ORDER_REVIEW_CONFIRMATION_UNIT) {
    return SOURCE_ORDER_REVIEW_PAYLOAD_SCHEMA
  }
  return DEPARTURE_REVIEW_PAYLOAD_SCHEMA
}
