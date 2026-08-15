import {
  AI_REVIEWABLE_BASIC_INFO_FIELDS,
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

export function toReviewPackageView(pkg: {
  id: string
  status: string
  confirmationUnit: string
  baseObjectVersion: number
  version: number
  runId: string
  candidates: unknown
}): AiReviewPackageView {
  return {
    id: pkg.id,
    status: pkg.status as AiReviewPackageView['status'],
    confirmationUnit: 'basic_info_draft',
    baseObjectVersion: pkg.baseObjectVersion,
    version: pkg.version,
    runId: pkg.runId,
    candidates: parseStoredCandidates(pkg.candidates).map((candidate) => ({
      fieldKey: candidate.fieldKey,
      proposedValue: candidate.proposedValue,
      userCorrectedValue: candidate.userCorrectedValue,
      clarity: candidate.clarity,
      status: candidate.status,
      evidence: candidate.evidence,
    })),
  }
}
