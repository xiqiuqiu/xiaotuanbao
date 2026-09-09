import { z } from 'zod'
import { DEPARTURE_OBJECT_TARGET_KIND } from './envelope'
import {
  type ReviewFieldControl,
  type ReviewFieldDescriptor,
  type ReviewSchema,
} from './review-schema'
import { type AiReviewCandidateInput } from '../tools/review-package'
import { SEGMENT_RESOURCE_REVIEW_KINDS } from './segment-resource-schema'

export const DEPARTURE_RESOURCE_REVIEW_PAYLOAD_SCHEMA = 'departure.departure_resource@v1' as const
export const DEPARTURE_RESOURCE_CONFIRMATION_UNIT = 'departure_resource' as const

export const DEPARTURE_RESOURCE_REVIEW_KINDS = SEGMENT_RESOURCE_REVIEW_KINDS

export type DepartureResourceReviewKind = (typeof DEPARTURE_RESOURCE_REVIEW_KINDS)[number]

export const DEPARTURE_RESOURCE_REVIEW_FIELDS = [
  'resourceKind',
  'supplierId',
  'title',
  'amountCents',
  'notes',
  'capacityWarning',
] as const

export type DepartureResourceReviewField = (typeof DEPARTURE_RESOURCE_REVIEW_FIELDS)[number]

const candidateBase = {
  clarity: z.enum(['clear', 'needs_confirmation', 'undetermined']),
  evidence: z
    .array(
      z.union([
        z
          .object({
            kind: z.literal('user_message'),
            excerpt: z.string().trim().min(1).max(2000),
            sequence: z.number().int().positive(),
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
            parseResultVersion: z.number().int().positive(),
            pageNumber: z.number().int().positive(),
            excerpt: z.string().trim().min(1).max(2000),
          })
          .strip(),
      ]),
    )
    .min(1),
}

export const departureResourceReviewCandidateSchema = z.discriminatedUnion('fieldKey', [
  z
    .object({
      fieldKey: z.literal('resourceKind'),
      proposedValue: z.enum(DEPARTURE_RESOURCE_REVIEW_KINDS),
      ...candidateBase,
    })
    .strip(),
  z
    .object({
      fieldKey: z.literal('supplierId'),
      proposedValue: z.string().trim().min(1).max(80),
      ...candidateBase,
    })
    .strip(),
  z
    .object({
      fieldKey: z.literal('title'),
      proposedValue: z.string().trim().min(1).max(200),
      ...candidateBase,
    })
    .strip(),
  z
    .object({
      fieldKey: z.literal('amountCents'),
      proposedValue: z.number().int().positive(),
      ...candidateBase,
    })
    .strip(),
  z
    .object({
      fieldKey: z.literal('notes'),
      proposedValue: z.string().trim().min(1).max(5000),
      ...candidateBase,
    })
    .strip(),
  z
    .object({
      fieldKey: z.literal('capacityWarning'),
      proposedValue: z.string().trim().min(1).max(2000),
      ...candidateBase,
    })
    .strip(),
])

export type DepartureResourceReviewCandidate = z.infer<typeof departureResourceReviewCandidateSchema>

const KIND_OPTIONS = [
  { label: '用车', value: 'transport' },
  { label: '酒店', value: 'hotel' },
  { label: '导游', value: 'guide' },
  { label: '拼出', value: 'outsource' },
  { label: '门票', value: 'ticket' },
  { label: '用餐', value: 'meal' },
  { label: '保险', value: 'insurance' },
  { label: '其他', value: 'other' },
] as const

const commonPresentation = {
  evidence: {
    presentation: 'expandable' as const,
    label: '查看证据',
    format: (items: AiReviewCandidateInput['evidence']) =>
      items
        .map((item) => {
          if (item.kind === 'user_message') return item.excerpt
          if (item.kind === 'material_region') return `资料第 ${item.pageNumber} 页：${item.excerpt}`
          return item.rule
        })
        .join('；'),
  },
  risk: { level: 'standard' as const, label: '普通业务变更' },
}

function formatReviewValue(value: unknown): string {
  return value == null || value === '' ? '未填写' : String(value)
}

function field(
  key: DepartureResourceReviewField,
  label: string,
  control: ReviewFieldControl,
  valueSchema: z.ZodType,
  extra?: Partial<ReviewFieldDescriptor<DepartureResourceReviewField>>,
): ReviewFieldDescriptor<DepartureResourceReviewField> {
  return {
    key,
    label,
    control,
    editable: extra?.editable ?? true,
    valueSchema,
    format: extra?.format ?? formatReviewValue,
    ...commonPresentation,
    ...extra,
  }
}

const DEPARTURE_RESOURCE_FIELDS: readonly ReviewFieldDescriptor<DepartureResourceReviewField>[] = [
  field('resourceKind', '资源种类', 'choice', z.enum(DEPARTURE_RESOURCE_REVIEW_KINDS), {
    options: KIND_OPTIONS.map((option) => ({ label: option.label, value: option.value })),
    format: (value) => KIND_OPTIONS.find((option) => option.value === value)?.label ?? formatReviewValue(value),
  }),
  field('supplierId', '供应商', 'reference', z.string().trim().min(1).max(80)),
  field('title', '资源名称', 'text', z.string().trim().min(1).max(200)),
  field('amountCents', '约定总价', 'integer', z.number().int().positive(), {
    number: { min: 1, precision: 0 },
    format: (value) => (typeof value === 'number' ? `${(value / 100).toFixed(2)} 元` : formatReviewValue(value)),
  }),
  field('notes', '备注', 'text', z.string().trim().min(1).max(5000)),
  field('capacityWarning', '执行冲突提醒', 'text', z.string().trim().min(1).max(2000), {
    editable: false,
    risk: { level: 'standard', label: '执行提醒，不阻止费用录入' },
  }),
]

export const DEPARTURE_RESOURCE_REVIEW_SCHEMA: ReviewSchema<DepartureResourceReviewField> = {
  schemaId: 'departure.departure_resource',
  version: 1,
  payloadSchema: DEPARTURE_RESOURCE_REVIEW_PAYLOAD_SCHEMA,
  targetKind: DEPARTURE_OBJECT_TARGET_KIND,
  confirmationUnits: [
    {
      key: DEPARTURE_RESOURCE_CONFIRMATION_UNIT,
      label: '发团级资源审核',
      targetLabel: '发团级资源',
      fields: DEPARTURE_RESOURCE_FIELDS,
    },
  ],
  parseCandidate: (candidate) => departureResourceReviewCandidateSchema.parse(candidate),
}

export type DepartureResourceReviewDraft = {
  resourceKind: DepartureResourceReviewKind
  supplierId: string
  title: string
  amountCents: number
  notes: string | null
}

export type DepartureResourceReviewWarning = {
  fieldKey: 'capacityWarning'
  message: string
}

export type DepartureResourceReviewResolution =
  | {
      status: 'ready'
      draft: DepartureResourceReviewDraft
      warnings: DepartureResourceReviewWarning[]
    }
  | {
      status: 'incomplete'
      missingFieldKeys: DepartureResourceReviewField[]
      reason: string
    }
  | {
      status: 'invalid'
      fieldKey: DepartureResourceReviewField
      reason: string
    }

const REQUIRED_WRITE_FIELDS = [
  'resourceKind',
  'supplierId',
  'title',
  'amountCents',
] as const satisfies readonly DepartureResourceReviewField[]

function effectiveValue(
  candidates: readonly { fieldKey: string; proposedValue: unknown }[],
  corrections: Partial<Record<string, unknown>> | undefined,
  fieldKey: DepartureResourceReviewField,
): unknown {
  if (corrections && fieldKey in corrections) {
    return corrections[fieldKey]
  }
  const found = candidates.find((candidate) => candidate.fieldKey === fieldKey)
  return found?.proposedValue
}

export function resolveDepartureResourceReviewDraft(
  candidates: readonly { fieldKey: string; proposedValue: unknown }[],
  corrections?: Partial<Record<string, unknown>>,
): DepartureResourceReviewResolution {
  const resourceKind = effectiveValue(candidates, corrections, 'resourceKind')
  const supplierId = effectiveValue(candidates, corrections, 'supplierId')
  const title = effectiveValue(candidates, corrections, 'title')
  const amountCents = effectiveValue(candidates, corrections, 'amountCents')
  const notes = effectiveValue(candidates, corrections, 'notes')
  const capacityWarning = effectiveValue(candidates, corrections, 'capacityWarning')

  const missing = REQUIRED_WRITE_FIELDS.filter((fieldKey) => {
    const value = effectiveValue(candidates, corrections, fieldKey)
    return value == null
  })
  if (missing.length > 0) {
    return {
      status: 'incomplete',
      missingFieldKeys: missing,
      reason: '发团级资源审核稿仍有待补充字段',
    }
  }

  if (typeof resourceKind !== 'string' || !DEPARTURE_RESOURCE_REVIEW_KINDS.includes(resourceKind as DepartureResourceReviewKind)) {
    return { status: 'invalid', fieldKey: 'resourceKind', reason: '资源种类不在本期新增目录内' }
  }
  if (typeof supplierId !== 'string' || supplierId.trim() === '') {
    return { status: 'invalid', fieldKey: 'supplierId', reason: '请选择供应商' }
  }
  if (typeof title !== 'string' || title.trim() === '') {
    return { status: 'invalid', fieldKey: 'title', reason: '资源名称不能为空' }
  }
  if (typeof amountCents !== 'number' || !Number.isInteger(amountCents) || amountCents < 1) {
    return { status: 'invalid', fieldKey: 'amountCents', reason: '约定总价必须为正整数分' }
  }
  if (notes != null && typeof notes !== 'string') {
    return { status: 'invalid', fieldKey: 'notes', reason: '备注必须是文字' }
  }

  const warnings: DepartureResourceReviewWarning[] = []
  if (typeof capacityWarning === 'string' && capacityWarning.trim() !== '') {
    warnings.push({ fieldKey: 'capacityWarning', message: capacityWarning.trim() })
  }

  return {
    status: 'ready',
    draft: {
      resourceKind: resourceKind as DepartureResourceReviewKind,
      supplierId: supplierId.trim(),
      title: title.trim(),
      amountCents,
      notes: typeof notes === 'string' && notes.trim() !== '' ? notes.trim() : null,
    },
    warnings,
  }
}

export const submitDepartureResourceReviewModelInputSchema = z
  .object({
    objectVersion: z.number().int().positive(),
    reviewPackageId: z.string().min(1).optional(),
    expectedPackageVersion: z.number().int().positive().optional(),
    confirmationUnit: z.literal(DEPARTURE_RESOURCE_CONFIRMATION_UNIT).default(DEPARTURE_RESOURCE_CONFIRMATION_UNIT),
    candidates: z.array(departureResourceReviewCandidateSchema).min(1),
  })
  .strip()
  .refine((value) => (value.reviewPackageId == null) === (value.expectedPackageVersion == null), {
    message: '修订审核包时必须同时提供 reviewPackageId 和 expectedPackageVersion',
    path: ['reviewPackageId'],
  })
  .refine(
    (value) => new Set(value.candidates.map((candidate) => candidate.fieldKey)).size === value.candidates.length,
    { message: '同一审核包内每个字段最多一条候选', path: ['candidates'] },
  )

export type SubmitDepartureResourceReviewModelInput = z.infer<
  typeof submitDepartureResourceReviewModelInputSchema
>

export const submitDepartureResourceReviewInputSchema = z
  .object({
    taskId: z.string().min(1),
    runId: z.string().min(1),
    objectVersion: z.number().int().positive(),
    reviewPackageId: z.string().min(1).optional(),
    expectedPackageVersion: z.number().int().positive().optional(),
    confirmationUnit: z.literal(DEPARTURE_RESOURCE_CONFIRMATION_UNIT).default(DEPARTURE_RESOURCE_CONFIRMATION_UNIT),
    candidates: z.array(departureResourceReviewCandidateSchema).min(1),
  })
  .strip()
  .refine((value) => (value.reviewPackageId == null) === (value.expectedPackageVersion == null), {
    message: '修订审核包时必须同时提供 reviewPackageId 和 expectedPackageVersion',
    path: ['reviewPackageId'],
  })
  .refine(
    (value) => new Set(value.candidates.map((candidate) => candidate.fieldKey)).size === value.candidates.length,
    { message: '同一审核包内每个字段最多一条候选', path: ['candidates'] },
  )

export type SubmitDepartureResourceReviewInput = z.infer<typeof submitDepartureResourceReviewInputSchema>
