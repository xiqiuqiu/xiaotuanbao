import type { AiReviewCandidateView, AiReviewableBasicInfoField } from '@xiaotuanbao/shared'

export const REVIEW_FIELD_LABELS: Record<AiReviewableBasicInfoField, string> = {
  name: '团名',
  routeName: '路线',
  templateId: '常用路线',
  startDate: '出团日期',
  endDate: '结束日期',
  expectedGuestCountHint: '预计人数提示',
}

export function formatReviewFieldList(fieldKeys: string[]): string {
  return fieldKeys
    .map((key) => REVIEW_FIELD_LABELS[key as AiReviewableBasicInfoField] ?? key)
    .join('、')
}

export function formatSavedValue(value: string | number | null | undefined): string {
  if (value == null || value === '') return '未填写'
  return String(value)
}

export function findReviewCandidate(
  pending: { candidates: AiReviewCandidateView[] } | null | undefined,
  fieldKey: AiReviewableBasicInfoField,
): AiReviewCandidateView | undefined {
  return pending?.candidates.find((candidate) => candidate.fieldKey === fieldKey)
}
