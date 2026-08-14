import { z } from 'zod'

export const SUBMIT_REVIEW_PACKAGE_TOOL = {
  name: 'submitReviewPackage',
  version: 1,
} as const

export const AWAIT_REVIEW_PACKAGE_DECISION_TOOL = {
  name: 'awaitReviewPackageDecision',
  version: 1,
} as const

export const AI_CREATE_TOOL_NAMES = [
  'getTaskContext',
  'searchRouteTemplates',
  'getMaterialParseResult',
  'submitReviewPackage',
] as const
export type AiCreateToolName = (typeof AI_CREATE_TOOL_NAMES)[number]

export const AI_REVIEWABLE_BASIC_INFO_FIELDS = [
  'name',
  'routeName',
  'templateId',
  'startDate',
  'endDate',
  'expectedGuestCountHint',
] as const

export type AiReviewableBasicInfoField = (typeof AI_REVIEWABLE_BASIC_INFO_FIELDS)[number]

export const AI_USER_ONLY_BASIC_INFO_FIELDS = ['ownerUserId', 'departureType'] as const

export const AI_CANDIDATE_CLARITY = ['clear', 'needs_confirmation', 'undetermined'] as const
export type AiCandidateClarity = (typeof AI_CANDIDATE_CLARITY)[number]

export const AI_REVIEW_PACKAGE_STATUS = ['pending', 'confirmed', 'rejected', 'superseded'] as const
export type AiReviewPackageStatus = (typeof AI_REVIEW_PACKAGE_STATUS)[number]

export const AI_CANDIDATE_STATUS = ['pending', 'confirmed', 'rejected', 'superseded'] as const
export type AiCandidateStatus = (typeof AI_CANDIDATE_STATUS)[number]

export const AI_REVIEW_CONFIRMATION_UNIT = 'basic_info_draft' as const

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export const aiCandidateEvidenceSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('user_message'),
      excerpt: z.string().trim().min(1).max(2000),
      messageId: z.string().min(1).optional(),
    })
    .strip(),
  z
    .object({
      kind: z.literal('system_derivation'),
      rule: z.string().trim().min(1).max(200),
    })
    .strip(),
  z
    .object({
      kind: z.literal('material_region'),
      materialId: z.string().min(1),
      pageNumber: z.number().int().positive(),
      excerpt: z.string().trim().min(1).max(2000),
      box: z.array(z.number()).min(4).max(8).optional(),
      coordinateSystem: z.enum(['pdf_point', 'pixel']),
    })
    .strip(),
])

const evidenceListSchema = z.array(aiCandidateEvidenceSchema).min(1)

const candidateBase = {
  clarity: z.enum(AI_CANDIDATE_CLARITY),
  evidence: evidenceListSchema,
}

export const aiReviewCandidateInputSchema = z.discriminatedUnion('fieldKey', [
  z
    .object({
      fieldKey: z.literal('name'),
      proposedValue: z.string().trim().min(1).max(200),
      ...candidateBase,
    })
    .strip(),
  z
    .object({
      fieldKey: z.literal('routeName'),
      proposedValue: z.string().trim().min(1).max(200),
      ...candidateBase,
    })
    .strip(),
  z
    .object({
      fieldKey: z.literal('templateId'),
      proposedValue: z.string().trim().min(1).max(200),
      ...candidateBase,
    })
    .strip(),
  z
    .object({
      fieldKey: z.literal('startDate'),
      proposedValue: z.string().regex(ISO_DATE),
      ...candidateBase,
    })
    .strip(),
  z
    .object({
      fieldKey: z.literal('endDate'),
      proposedValue: z.string().regex(ISO_DATE),
      ...candidateBase,
    })
    .strip(),
  z
    .object({
      fieldKey: z.literal('expectedGuestCountHint'),
      proposedValue: z.number().int().min(0).max(9999),
      ...candidateBase,
    })
    .strip(),
])

function uniqueFieldKeys(candidates: Array<{ fieldKey: string }>): boolean {
  const keys = candidates.map((candidate) => candidate.fieldKey)
  return new Set(keys).size === keys.length
}

function dateOrderValid(
  candidates: Array<{ fieldKey: string; proposedValue: string | number }>,
): boolean {
  const start = candidates.find((candidate) => candidate.fieldKey === 'startDate')
  const end = candidates.find((candidate) => candidate.fieldKey === 'endDate')
  if (!start || !end) return true
  return String(start.proposedValue) <= String(end.proposedValue)
}

export const submitReviewPackageInputSchema = z
  .object({
    taskId: z.string().min(1),
    runId: z.string().min(1),
    objectVersion: z.number().int().positive(),
    confirmationUnit: z.literal(AI_REVIEW_CONFIRMATION_UNIT).default(AI_REVIEW_CONFIRMATION_UNIT),
    candidates: z.array(aiReviewCandidateInputSchema).min(1),
  })
  .strip()
  .refine((value) => uniqueFieldKeys(value.candidates), {
    message: '同一审核包内每个字段最多一条候选',
    path: ['candidates'],
  })
  .refine((value) => dateOrderValid(value.candidates), {
    message: '结束日期不能早于出团日期',
    path: ['candidates'],
  })

export const submitReviewPackageModelInputSchema = z
  .object({
    objectVersion: z.number().int().positive(),
    confirmationUnit: z.literal(AI_REVIEW_CONFIRMATION_UNIT).default(AI_REVIEW_CONFIRMATION_UNIT),
    candidates: z.array(aiReviewCandidateInputSchema).min(1),
  })
  .strip()
  .refine((value) => uniqueFieldKeys(value.candidates), {
    message: '同一审核包内每个字段最多一条候选',
    path: ['candidates'],
  })
  .refine((value) => dateOrderValid(value.candidates), {
    message: '结束日期不能早于出团日期',
    path: ['candidates'],
  })

export const submitReviewPackageOutputSchema = z
  .object({
    reviewPackageId: z.string().min(1),
    status: z.literal('pending'),
    objectVersion: z.number().int().positive(),
    fieldKeys: z.array(z.enum(AI_REVIEWABLE_BASIC_INFO_FIELDS)).min(1),
  })
  .strip()

export const awaitReviewPackageDecisionInputSchema = z
  .object({
    reviewPackageId: z.string().min(1),
  })
  .strip()

export const reviewPackageDecisionSchema = z.discriminatedUnion('status', [
  z
    .object({
      reviewPackageId: z.string().min(1),
      status: z.literal('confirmed'),
      snapshotVersion: z.number().int().positive(),
    })
    .strip(),
  z
    .object({
      reviewPackageId: z.string().min(1),
      status: z.literal('rejected'),
    })
    .strip(),
])

export const aiCreateToolNameSchema = z.enum(AI_CREATE_TOOL_NAMES)

export function capabilitiesForPendingReview(hasPendingReview: boolean): AiCreateToolName[] {
  if (hasPendingReview) {
    return ['getTaskContext', 'searchRouteTemplates', 'getMaterialParseResult']
  }
  return ['getTaskContext', 'searchRouteTemplates', 'getMaterialParseResult', 'submitReviewPackage']
}

export type AiCandidateEvidence = z.infer<typeof aiCandidateEvidenceSchema>
export type AiReviewCandidateInput = z.infer<typeof aiReviewCandidateInputSchema>
export type SubmitReviewPackageInput = z.infer<typeof submitReviewPackageInputSchema>
export type SubmitReviewPackageModelInput = z.infer<typeof submitReviewPackageModelInputSchema>
export type SubmitReviewPackageOutput = z.infer<typeof submitReviewPackageOutputSchema>
export type AwaitReviewPackageDecisionInput = z.infer<
  typeof awaitReviewPackageDecisionInputSchema
>
export type ReviewPackageDecision = z.infer<typeof reviewPackageDecisionSchema>
