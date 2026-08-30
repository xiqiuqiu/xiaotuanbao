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
  payloadSchema: string,
  confirmationUnit: string,
): string {
  return fieldKeys
    .map((key) => resolveReviewField(payloadSchema, confirmationUnit, key)?.label ?? key)
    .join('、')
}

export function findReviewCandidate(
  pending:
    | {
        candidates: AiReviewCandidateView[]
        payloadSchema: string
        confirmationUnit: string
      }
    | null
    | undefined,
  fieldKey: AiReviewableBasicInfoField,
): AiReviewCandidateView | undefined {
  if (!pending) return undefined
  if (!resolveReviewField(
    pending.payloadSchema,
    pending.confirmationUnit,
    fieldKey,
  )) return undefined
  return pending.candidates.find((candidate) => candidate.fieldKey === fieldKey)
}
