import type { AiCreateDraftSnapshot } from '../context/classify-draft-fields'
import {
  AI_REVIEWABLE_BASIC_INFO_FIELDS,
  type AiReviewableBasicInfoField,
} from '../tools/review-package'

export const DATE_CONSISTENCY_GROUP: readonly AiReviewableBasicInfoField[] = [
  'startDate',
  'endDate',
]

export type ReviewConfirmSubmission = Partial<
  Record<AiReviewableBasicInfoField, string | number | null>
>

export type ReviewConfirmMergeResult =
  | { status: 'ok'; nextSnapshot: AiCreateDraftSnapshot }
  | { status: 'conflict'; conflictFields: AiReviewableBasicInfoField[] }

function snapshotValue(
  snapshot: AiCreateDraftSnapshot,
  field: AiReviewableBasicInfoField,
): string | number | null {
  const value = snapshot[field]
  if (value === undefined || value === '') return null
  return value
}

function sameValue(left: string | number | null, right: string | number | null): boolean {
  if (left == null && right == null) return true
  return left === right
}

function fieldsToGuard(
  submittedFields: AiReviewableBasicInfoField[],
): Set<AiReviewableBasicInfoField> {
  const guarded = new Set(submittedFields)
  if (DATE_CONSISTENCY_GROUP.some((field) => guarded.has(field))) {
    for (const field of DATE_CONSISTENCY_GROUP) {
      guarded.add(field)
    }
  }
  return guarded
}

export function evaluateReviewConfirmMerge(args: {
  baselineSnapshot: AiCreateDraftSnapshot
  currentSnapshot: AiCreateDraftSnapshot
  submissions: ReviewConfirmSubmission
}): ReviewConfirmMergeResult {
  const submittedFields = AI_REVIEWABLE_BASIC_INFO_FIELDS.filter(
    (field) => args.submissions[field] !== undefined,
  )
  const guarded = fieldsToGuard(submittedFields)
  const conflictFields = [...guarded].filter(
    (field) => !sameValue(snapshotValue(args.baselineSnapshot, field), snapshotValue(args.currentSnapshot, field)),
  )

  if (conflictFields.length > 0) {
    return { status: 'conflict', conflictFields }
  }

  const nextSnapshot: AiCreateDraftSnapshot = { ...args.currentSnapshot }
  for (const field of submittedFields) {
    const value = args.submissions[field]
    if (value === undefined) continue
    if (field === 'expectedGuestCountHint') {
      nextSnapshot.expectedGuestCountHint =
        value === null || value === '' ? null : Number(value)
      continue
    }
    const text = value == null ? '' : String(value).trim()
    if (field === 'routeName') {
      nextSnapshot.routeName = text
      continue
    }
    if (field === 'name') {
      nextSnapshot.name = text.length > 0 ? text : null
      continue
    }
    if (field === 'startDate') {
      nextSnapshot.startDate = text.length > 0 ? text : null
      continue
    }
    nextSnapshot.endDate = text.length > 0 ? text : null
  }

  return { status: 'ok', nextSnapshot }
}
