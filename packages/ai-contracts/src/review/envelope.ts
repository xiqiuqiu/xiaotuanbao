import { createHash } from 'node:crypto'
import { z } from 'zod'
import { AI_REVIEWABLE_BASIC_INFO_FIELDS, type AiReviewableBasicInfoField } from '../tools/review-package'

export const DEPARTURE_REVIEW_TARGET_KIND = 'departure_creation_draft' as const
export const DEPARTURE_REVIEW_PAYLOAD_SCHEMA = 'departure.basic_info_draft@v1' as const

export const REVIEW_PROPOSAL_IDENTITY_FIELDS = [
  'inputBatchId',
  'capabilityVersion',
  'targetKind',
  'targetId',
  'proposalHash',
] as const

export type ReviewProposalIdentity = {
  inputBatchId: string
  capabilityVersion: number
  targetKind: string
  targetId: string
  proposalHash: string
}

export type ReviewDecisionIdentity = {
  reviewPackageId: string
  reviewVersion: number
  decisionCommandId: string
}

export const reviewProposalIdentitySchema = z
  .object({
    inputBatchId: z.string().min(1),
    capabilityVersion: z.number().int().positive(),
    targetKind: z.string().min(1),
    targetId: z.string().min(1),
    proposalHash: z.string().length(64),
  })
  .strip()

export const reviewDecisionIdentitySchema = z
  .object({
    reviewPackageId: z.string().min(1),
    reviewVersion: z.number().int().positive(),
    decisionCommandId: z.string().min(1).max(200),
  })
  .strip()

export const reviewPackageEnvelopeSchema = z
  .object({
    conversationId: z.string().min(1),
    inputBatchId: z.string().min(1),
    attemptId: z.string().min(1).nullable(),
    sourceActionId: z.string().min(1),
    capabilityKey: z.string().min(1),
    capabilityVersion: z.number().int().positive(),
    targetKind: z.string().min(1),
    targetId: z.string().min(1),
    baseVersion: z.number().int().positive(),
    proposalHash: z.string().length(64),
    status: z.enum(['pending', 'confirmed', 'rejected', 'superseded', 'conflict', 'cancelled']),
  })
  .strip()

export type ReviewPackageEnvelope = z.infer<typeof reviewPackageEnvelopeSchema>

export function canonicalizeReviewValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalizeReviewValue)
  }
  if (value instanceof Date) {
    return value.toISOString()
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalizeReviewValue(entry)]),
    )
  }
  return value
}

export function reviewProposalHash(payload: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalizeReviewValue(payload)))
    .digest('hex')
}

export function sameReviewProposalIdentity(
  left: ReviewProposalIdentity,
  right: ReviewProposalIdentity,
): boolean {
  const parsedLeft = reviewProposalIdentitySchema.parse(left)
  const parsedRight = reviewProposalIdentitySchema.parse(right)
  return REVIEW_PROPOSAL_IDENTITY_FIELDS.every((field) => parsedLeft[field] === parsedRight[field])
}

export function isTargetVersionStale(baseVersion: number, currentVersion: number): boolean {
  return baseVersion !== currentVersion
}

export type ReviewConflictChangeSummary = {
  baseVersion: number
  currentVersion: number
  changedFieldKeys: AiReviewableBasicInfoField[]
}

export function reviewConflictChangeSummary(args: {
  baseVersion: number
  currentVersion: number
  baseline: object
  current: object
}): ReviewConflictChangeSummary {
  const baseline = args.baseline as Record<string, unknown>
  const current = args.current as Record<string, unknown>
  const changedFieldKeys = AI_REVIEWABLE_BASIC_INFO_FIELDS.filter((field) => {
    const left = baseline[field] ?? null
    const right = current[field] ?? null
    return JSON.stringify(canonicalizeReviewValue(left)) !== JSON.stringify(canonicalizeReviewValue(right))
  })
  return {
    baseVersion: args.baseVersion,
    currentVersion: args.currentVersion,
    changedFieldKeys,
  }
}
