import { createHash } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import {
  AI_CREATE_CAPABILITY_REFS_BY_TOOL,
  DEFAULT_REVIEW_ITEM_IDENTITY,
  DEPARTURE_REVIEW_PAYLOAD_SCHEMA,
  DEPARTURE_REVIEW_TARGET_KIND,
  SOURCE_ORDER_REVIEW_CONFIRMATION_UNIT,
  SOURCE_ORDER_REVIEW_PAYLOAD_SCHEMA,
  canonicalizeReviewValue,
} from '@xiaotuanbao/ai-contracts'
import { toStoredCandidates } from './review-package.mapper'

type ReviewPackageProposal = {
  objectVersion: number
  confirmationUnit: string
  candidates: Array<{
    fieldKey: string
    proposedValue?: unknown
    clarity: 'clear' | 'needs_confirmation' | 'undetermined'
    evidence: Parameters<typeof toStoredCandidates>[0][number]['evidence']
  }>
}

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
  const capability = AI_CREATE_CAPABILITY_REFS_BY_TOOL.submitReviewPackage
  const payloadSchema =
    params.payloadSchema ??
    (params.reviewPackage.confirmationUnit === SOURCE_ORDER_REVIEW_CONFIRMATION_UNIT
      ? SOURCE_ORDER_REVIEW_PAYLOAD_SCHEMA
      : DEPARTURE_REVIEW_PAYLOAD_SCHEMA)
  return {
    organization: { connect: { id: params.organizationId } },
    task: { connect: { id: params.taskId } },
    conversation: { connect: { id: params.conversationId } },
    inputBatch: { connect: { id: params.inputBatchId } },
    ...(params.attemptId ? { attempt: { connect: { id: params.attemptId } } } : {}),
    sourceAction: { connect: { id: params.sourceActionId } },
    status: 'pending',
    confirmationUnit: params.reviewPackage.confirmationUnit,
    payloadSchema,
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
