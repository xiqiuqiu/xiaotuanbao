import type { AiCreateDraftSnapshot } from '../context/classify-draft-fields'
import {
  AI_REVIEWABLE_DEPARTURE_TYPES,
  AI_REVIEWABLE_BASIC_INFO_FIELDS,
  type AiReviewableBasicInfoField,
} from '../tools/review-package'

/** 出团日与结束日成对；确认时对齐区间，不再把未提交的结束日锁回 baseline。 */
export const DATE_CONSISTENCY_GROUP: readonly AiReviewableBasicInfoField[] = [
  'startDate',
  'endDate',
]

export const ROUTE_CONSISTENCY_GROUP: readonly AiReviewableBasicInfoField[] = [
  'templateId',
  'routeName',
]

export type ReviewConfirmSubmission = Partial<
  Record<AiReviewableBasicInfoField, string | number | null>
>

export type ReviewConfirmMergeResult =
  | { status: 'ok'; nextSnapshot: AiCreateDraftSnapshot }
  | { status: 'conflict'; conflictFields: AiReviewableBasicInfoField[] }
  | { status: 'invalid'; invalidFields: AiReviewableBasicInfoField[] }

function isReviewableDepartureType(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    (AI_REVIEWABLE_DEPARTURE_TYPES as readonly string[]).includes(value)
  )
}

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
  if (ROUTE_CONSISTENCY_GROUP.some((field) => guarded.has(field))) {
    for (const field of ROUTE_CONSISTENCY_GROUP) {
      guarded.add(field)
    }
  }
  return guarded
}

function addIsoDateDays(dateStr: string, days: number): string {
  const date = new Date(`${dateStr}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function alignEndDateToStart(snapshot: AiCreateDraftSnapshot): void {
  const startDate = snapshot.startDate?.trim() || null
  const endDate = snapshot.endDate?.trim() || null
  if (!startDate) return
  if (endDate && endDate >= startDate) return
  const days = snapshot.defaultDayCount
  snapshot.endDate =
    typeof days === 'number' && days > 0 ? addIsoDateDays(startDate, days - 1) : startDate
}

function adoptingTemplateId(submissions: ReviewConfirmSubmission): string | null {
  const value = submissions.templateId
  if (typeof value !== 'string') return null
  const text = value.trim()
  return text.length > 0 ? text : null
}

export function preservePendingCandidateBaseline(args: {
  draft: AiCreateDraftSnapshot
  baselineSnapshot: AiCreateDraftSnapshot
  candidateFields: readonly string[]
}): AiCreateDraftSnapshot {
  const submittedFields = args.candidateFields.filter(
    (field): field is AiReviewableBasicInfoField =>
      (AI_REVIEWABLE_BASIC_INFO_FIELDS as readonly string[]).includes(field),
  )
  const guarded = fieldsToGuard(submittedFields)
  if (guarded.size === 0) return args.draft

  const next: AiCreateDraftSnapshot = { ...args.draft }
  for (const field of guarded) {
    const value = snapshotValue(args.baselineSnapshot, field)
    if (field === 'expectedGuestCountHint') {
      next.expectedGuestCountHint = value == null ? null : Number(value)
      continue
    }
    if (field === 'templateId') {
      next.templateId = typeof value === 'string' ? value : null
      continue
    }
    if (field === 'routeName') {
      next.routeName = typeof value === 'string' ? value : ''
      continue
    }
    next[field] = typeof value === 'string' || value == null ? value : String(value)
  }
  return next
}

export function pendingCandidateSnapshotDrift(args: {
  draft: AiCreateDraftSnapshot
  baselineSnapshot: AiCreateDraftSnapshot
  candidateFields: readonly string[]
}): boolean {
  const submittedFields = args.candidateFields.filter(
    (field): field is AiReviewableBasicInfoField =>
      (AI_REVIEWABLE_BASIC_INFO_FIELDS as readonly string[]).includes(field),
  )
  const guarded = fieldsToGuard(submittedFields)
  return [...guarded].some(
    (field) =>
      !sameValue(snapshotValue(args.draft, field), snapshotValue(args.baselineSnapshot, field)),
  )
}

export function evaluateReviewConfirmMerge(args: {
  baselineSnapshot: AiCreateDraftSnapshot
  currentSnapshot: AiCreateDraftSnapshot
  submissions: ReviewConfirmSubmission
}): ReviewConfirmMergeResult {
  const submittedFields = AI_REVIEWABLE_BASIC_INFO_FIELDS.filter(
    (field) => args.submissions[field] !== undefined,
  )
  if (
    submittedFields.includes('departureType') &&
    !isReviewableDepartureType(args.submissions.departureType)
  ) {
    return { status: 'invalid', invalidFields: ['departureType'] }
  }
  const guarded = fieldsToGuard(submittedFields)
  const conflictFields = [...guarded].filter(
    (field) => !sameValue(snapshotValue(args.baselineSnapshot, field), snapshotValue(args.currentSnapshot, field)),
  )

  if (conflictFields.length > 0) {
    return { status: 'conflict', conflictFields }
  }

  const nextSnapshot: AiCreateDraftSnapshot = { ...args.currentSnapshot }
  const templateId = adoptingTemplateId(args.submissions)

  for (const field of submittedFields) {
    const value = args.submissions[field]
    if (value === undefined) continue
    if (field === 'expectedGuestCountHint') {
      nextSnapshot.expectedGuestCountHint =
        value === null || value === '' ? null : Number(value)
      continue
    }
    if (field === 'templateId') {
      if (templateId) {
        nextSnapshot.mode = 'template'
        nextSnapshot.templateId = templateId
      }
      continue
    }
    const text = value == null ? '' : String(value).trim()
    if (field === 'routeName') {
      nextSnapshot.routeName = text
      if (!templateId) {
        nextSnapshot.mode = 'manual'
        nextSnapshot.templateId = null
        nextSnapshot.defaultDayCount = null
      }
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
    if (field === 'endDate') {
      nextSnapshot.endDate = text.length > 0 ? text : null
      continue
    }
    if (field === 'departureType') {
      nextSnapshot.departureType = text
      continue
    }
    if (field === 'notes') {
      nextSnapshot.notes = text.length > 0 ? text : null
      continue
    }
    if (field === 'driverSupplierId') {
      nextSnapshot.driverSupplierId = text.length > 0 ? text : null
      continue
    }
    if (field === 'guideSupplierId') {
      nextSnapshot.guideSupplierId = text.length > 0 ? text : null
      continue
    }
    if (field === 'vehiclePlate') {
      nextSnapshot.vehiclePlate = text.length > 0 ? text : null
      continue
    }
    if (field === 'contactPhone') {
      nextSnapshot.contactPhone = text.length > 0 ? text : null
    }
  }

  alignEndDateToStart(nextSnapshot)
  return { status: 'ok', nextSnapshot }
}
