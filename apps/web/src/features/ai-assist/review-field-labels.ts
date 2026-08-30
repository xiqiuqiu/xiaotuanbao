import type { AiReviewCandidateView, AiReviewableBasicInfoField } from '@xiaotuanbao/shared'
import {
  DEPARTURE_REVIEW_PAYLOAD_SCHEMA,
  registeredReviewSchemas,
  resolveReviewField,
} from '@xiaotuanbao/ai-contracts'

const departureUnit = registeredReviewSchemas.requireConfirmationUnit(
  DEPARTURE_REVIEW_PAYLOAD_SCHEMA,
  'basic_info_draft',
).unit

export const REVIEW_FIELD_LABELS = Object.fromEntries(
  departureUnit.fields.map((field) => [field.key, field.label]),
) as Record<AiReviewableBasicInfoField, string>

export function formatReviewFieldList(
  fieldKeys: string[],
  payloadSchema: string = DEPARTURE_REVIEW_PAYLOAD_SCHEMA,
  confirmationUnit: string = 'basic_info_draft',
): string {
  return fieldKeys
    .map((key) => resolveReviewField(payloadSchema, confirmationUnit, key)?.label ?? key)
    .join('、')
}

export function findReviewCandidate(
  pending: { candidates: AiReviewCandidateView[] } | null | undefined,
  fieldKey: AiReviewableBasicInfoField,
): AiReviewCandidateView | undefined {
  if (!pending || !('payloadSchema' in pending) || !('confirmationUnit' in pending)) {
    return pending?.candidates.find((candidate) => candidate.fieldKey === fieldKey)
  }
  if (!resolveReviewField(
    String(pending.payloadSchema),
    String(pending.confirmationUnit),
    fieldKey,
  )) return undefined
  return pending?.candidates.find((candidate) => candidate.fieldKey === fieldKey)
}
