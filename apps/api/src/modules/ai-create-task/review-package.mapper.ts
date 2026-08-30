import {
  AI_REVIEWABLE_BASIC_INFO_FIELDS,
  DEPARTURE_REVIEW_PAYLOAD_SCHEMA,
  registeredReviewSchemas,
  type AiReviewCandidateInput,
  type AiReviewableBasicInfoField,
} from '@xiaotuanbao/ai-contracts'
import type { AiReviewCandidateView, AiReviewPackageView } from '@xiaotuanbao/shared'

export interface StoredReviewCandidate {
  fieldKey: AiReviewableBasicInfoField
  proposedValue: string | number
  userCorrectedValue?: string | number | null
  clarity: 'clear' | 'needs_confirmation' | 'undetermined'
  status: 'pending' | 'confirmed' | 'rejected' | 'superseded'
  evidence: AiReviewCandidateView['evidence']
}

export function toStoredCandidates(candidates: AiReviewCandidateInput[]): StoredReviewCandidate[] {
  return candidates.map((candidate) => ({
    fieldKey: candidate.fieldKey,
    proposedValue: candidate.proposedValue,
    clarity: candidate.clarity,
    status: 'pending',
    evidence: candidate.evidence,
  }))
}

export function parseStoredCandidates(raw: unknown): StoredReviewCandidate[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((item): item is StoredReviewCandidate => {
    if (!item || typeof item !== 'object') return false
    const candidate = item as StoredReviewCandidate
    return (AI_REVIEWABLE_BASIC_INFO_FIELDS as readonly string[]).includes(candidate.fieldKey)
  })
}

export function effectiveCandidateValue(
  candidate: StoredReviewCandidate,
): string | number | null {
  return candidate.userCorrectedValue !== undefined
    ? candidate.userCorrectedValue
    : candidate.proposedValue
}

export function reviewConfirmValues(candidates: StoredReviewCandidate[]): {
  corrections: Partial<Record<AiReviewableBasicInfoField, string | number | null>>
  submissions: Partial<Record<AiReviewableBasicInfoField, string | number | null>>
} {
  return {
    corrections: Object.fromEntries(
      candidates
        .filter((candidate) => candidate.userCorrectedValue !== undefined)
        .map((candidate) => [candidate.fieldKey, candidate.userCorrectedValue]),
    ),
    submissions: Object.fromEntries(
      candidates.map((candidate) => [candidate.fieldKey, effectiveCandidateValue(candidate)]),
    ),
  }
}

function parseUserCorrections(
  raw: unknown,
): Partial<Record<AiReviewableBasicInfoField, string | number | null>> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const corrections: Partial<Record<AiReviewableBasicInfoField, string | number | null>> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!(AI_REVIEWABLE_BASIC_INFO_FIELDS as readonly string[]).includes(key)) continue
    if (value === null || typeof value === 'string' || typeof value === 'number') {
      corrections[key as AiReviewableBasicInfoField] = value
    }
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
  const payloadSchema = pkg.payloadSchema ?? DEPARTURE_REVIEW_PAYLOAD_SCHEMA
  const registeredSchema = registeredReviewSchemas.findByPayloadSchema(payloadSchema)
  const confirmationUnit = registeredSchema?.confirmationUnits.find(
    (unit) => unit.key === pkg.confirmationUnit,
  )
  const candidatePayloadSupported = Boolean(
    confirmationUnit &&
      Array.isArray(pkg.candidates) &&
      pkg.candidates.length > 0 &&
      pkg.candidates.every((candidate) => {
        try {
          registeredSchema?.parseCandidate(candidate)
          return confirmationUnit.fields.some(
            (field) =>
              candidate != null &&
              typeof candidate === 'object' &&
              'fieldKey' in candidate &&
              field.key === candidate.fieldKey,
          )
        } catch {
          return false
        }
      }),
  )
  const corrections = parseUserCorrections(pkg.userCorrections)
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
    targetKind: pkg.targetKind ?? 'departure_creation_draft',
    targetId: pkg.targetId ?? '',
    proposalHash: pkg.proposalHash ?? '',
    candidates: (candidatePayloadSupported ? parseStoredCandidates(pkg.candidates) : []).map((candidate) => ({
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
