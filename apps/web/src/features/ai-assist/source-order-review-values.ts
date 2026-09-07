import type { AiReviewCandidateView } from '@xiaotuanbao/shared'

export function valuesFromReviewCandidates(
  candidates: AiReviewCandidateView[],
): Record<string, unknown> {
  const values: Record<string, unknown> = {}
  for (const candidate of candidates) {
    values[candidate.fieldKey] =
      candidate.userCorrectedValue !== undefined
        ? candidate.userCorrectedValue
        : candidate.proposedValue
  }
  return values
}
