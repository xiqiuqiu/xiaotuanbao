import {
  registeredReviewSchemas,
  type ReviewSchema,
  type ReviewSchemaCandidate,
} from '@xiaotuanbao/ai-contracts'
import type { AiReviewCandidateView, AiReviewPackageView } from '@xiaotuanbao/shared'

export interface StoredReviewCandidate<FieldKey extends string = string> {
  fieldKey: FieldKey
  proposedValue: string | number
  userCorrectedValue?: string | number | null
  clarity: 'clear' | 'needs_confirmation' | 'undetermined'
  status: 'pending' | 'confirmed' | 'rejected' | 'superseded'
  evidence: AiReviewCandidateView['evidence']
}

export function toStoredCandidates(
  candidates: readonly ReviewSchemaCandidate[],
): StoredReviewCandidate[] {
  return candidates.map((candidate) => ({
    fieldKey: candidate.fieldKey,
    proposedValue: candidate.proposedValue,
    clarity: candidate.clarity,
    status: 'pending',
    evidence: candidate.evidence,
  }))
}

export function parseStoredCandidates(
  raw: unknown,
  schema: ReviewSchema,
  confirmationUnit: string,
): StoredReviewCandidate[] {
  if (!Array.isArray(raw)) return []
  const unit = schema.confirmationUnits.find((candidate) => candidate.key === confirmationUnit)
  if (!unit) return []
  const allowedStatuses = new Set(['pending', 'confirmed', 'rejected', 'superseded'])
  const parsed: StoredReviewCandidate[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') return []
    const stored = item as Partial<StoredReviewCandidate>
    if (!allowedStatuses.has(String(stored.status))) return []
    let candidate: ReviewSchemaCandidate
    try {
      candidate = schema.parseCandidate(stored)
    } catch {
      return []
    }
    const field = unit.fields.find((descriptor) => descriptor.key === candidate.fieldKey)
    if (!field) return []
    if (
      stored.userCorrectedValue !== undefined &&
      stored.userCorrectedValue !== null &&
      !field.valueSchema.safeParse(stored.userCorrectedValue).success
    ) {
      return []
    }
    parsed.push({
      ...candidate,
      status: stored.status as StoredReviewCandidate['status'],
      ...(stored.userCorrectedValue !== undefined
        ? { userCorrectedValue: stored.userCorrectedValue }
        : {}),
    })
  }
  return parsed
}

export function effectiveCandidateValue(
  candidate: StoredReviewCandidate,
): string | number | null {
  return candidate.userCorrectedValue !== undefined
    ? candidate.userCorrectedValue
    : candidate.proposedValue
}

export function reviewConfirmValues<FieldKey extends string>(
  candidates: StoredReviewCandidate<FieldKey>[],
): {
  corrections: Partial<Record<FieldKey, string | number | null>>
  submissions: Partial<Record<FieldKey, string | number | null>>
} {
  return {
    corrections: Object.fromEntries(
      candidates
        .filter((candidate) => candidate.userCorrectedValue !== undefined)
        .map((candidate) => [candidate.fieldKey, candidate.userCorrectedValue]),
    ) as Partial<Record<FieldKey, string | number | null>>,
    submissions: Object.fromEntries(
      candidates.map((candidate) => [candidate.fieldKey, effectiveCandidateValue(candidate)]),
    ) as Partial<Record<FieldKey, string | number | null>>,
  }
}

function parseUserCorrections(
  raw: unknown,
  schema: ReviewSchema,
  confirmationUnit: string,
): Partial<Record<string, string | number | null>> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const unit = schema.confirmationUnits.find((candidate) => candidate.key === confirmationUnit)
  if (!unit) return {}
  const corrections: Partial<Record<string, string | number | null>> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const field = unit.fields.find((candidate) => candidate.key === key)
    if (!field || (value !== null && !field.valueSchema.safeParse(value).success)) continue
    corrections[key] = value as string | number | null
  }
  return corrections
}

export function toReviewPackageView(pkg: {
  id: string
  status: string
  confirmationUnit: string
  payloadSchema?: string | null
  baseObjectVersion: number
  version: number
  runId?: string | null
  conversationId?: string | null
  inputBatchId?: string | null
  attemptId?: string | null
  capabilityKey?: string | null
  capabilityVersion?: number | null
  targetKind?: string | null
  targetId?: string | null
  proposalHash?: string | null
  candidates: unknown
  baselineSnapshot: unknown
  userCorrections?: unknown
}): AiReviewPackageView {
  const payloadSchema = pkg.payloadSchema ?? ''
  const registeredSchema = registeredReviewSchemas.findByPayloadSchema(payloadSchema)
  const confirmationUnit = registeredSchema?.confirmationUnits.find(
    (unit) => unit.key === pkg.confirmationUnit,
  )
  const parsedCandidates = registeredSchema
    ? parseStoredCandidates(pkg.candidates, registeredSchema, pkg.confirmationUnit)
    : []
  const candidatePayloadSupported = Boolean(
    confirmationUnit &&
      pkg.targetKind === registeredSchema?.targetKind &&
      Array.isArray(pkg.candidates) &&
      pkg.candidates.length > 0 &&
      parsedCandidates.length === pkg.candidates.length,
  )
  const corrections = registeredSchema
    ? parseUserCorrections(pkg.userCorrections, registeredSchema, pkg.confirmationUnit)
    : {}
  return {
    id: pkg.id,
    status: pkg.status as AiReviewPackageView['status'],
    confirmationUnit: pkg.confirmationUnit,
    payloadSchema,
    schemaSupported: candidatePayloadSupported,
    baseObjectVersion: pkg.baseObjectVersion,
    version: pkg.version,
    runId: pkg.runId ?? null,
    conversationId: pkg.conversationId ?? null,
    inputBatchId: pkg.inputBatchId ?? null,
    attemptId: pkg.attemptId ?? null,
    capabilityKey: pkg.capabilityKey ?? 'departure.review-package.propose',
    capabilityVersion: pkg.capabilityVersion ?? 1,
    targetKind: pkg.targetKind ?? '',
    targetId: pkg.targetId ?? '',
    proposalHash: pkg.proposalHash ?? '',
    candidates: (candidatePayloadSupported ? parsedCandidates : []).map((candidate) => ({
      fieldKey: candidate.fieldKey,
      proposedValue: candidate.proposedValue,
      userCorrectedValue:
        candidate.fieldKey in corrections
          ? corrections[candidate.fieldKey]
          : candidate.userCorrectedValue,
      clarity: candidate.clarity,
      status: candidate.status,
      evidence: candidate.evidence,
    })),
    baselineSnapshot: pkg.baselineSnapshot as AiReviewPackageView['baselineSnapshot'],
  }
}
