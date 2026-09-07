import { z } from 'zod'
import { DEPARTURE_OBJECT_TARGET_KIND } from './envelope'
import {
  type ReviewFieldControl,
  type ReviewFieldDescriptor,
  type ReviewSchema,
} from './review-schema'
import { type AiReviewCandidateInput } from '../tools/review-package'

export const SEGMENT_RESOURCE_REVIEW_PAYLOAD_SCHEMA = 'departure.segment_resource@v1' as const
export const SEGMENT_RESOURCE_CONFIRMATION_UNIT = 'segment_resource' as const

export const SEGMENT_RESOURCE_REVIEW_KINDS = [
  'transport',
  'hotel',
  'guide',
  'outsource',
  'ticket',
  'meal',
  'insurance',
  'other',
] as const

export type SegmentResourceReviewKind = (typeof SEGMENT_RESOURCE_REVIEW_KINDS)[number]

export const SEGMENT_RESOURCE_REVIEW_FIELDS = [
  'itinerarySegmentId',
  'resourceKind',
  'supplierId',
  'title',
  'amountCents',
  'notes',
  'capacityWarning',
] as const

export type SegmentResourceReviewField = (typeof SEGMENT_RESOURCE_REVIEW_FIELDS)[number]

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

export const segmentResourceReviewCandidateSchema = z.discriminatedUnion('fieldKey', [
  z
    .object({
      fieldKey: z.literal('itinerarySegmentId'),
      proposedValue: z.string().trim().min(1).max(80),
      ...candidateBase,
    })
    .strip(),
  z
    .object({
      fieldKey: z.literal('resourceKind'),
      proposedValue: z.enum(SEGMENT_RESOURCE_REVIEW_KINDS),
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

export type SegmentResourceReviewCandidate = z.infer<typeof segmentResourceReviewCandidateSchema>

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
  key: SegmentResourceReviewField,
  label: string,
  control: ReviewFieldControl,
  valueSchema: z.ZodType,
  extra?: Partial<ReviewFieldDescriptor<SegmentResourceReviewField>>,
): ReviewFieldDescriptor<SegmentResourceReviewField> {
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

const SEGMENT_RESOURCE_FIELDS: readonly ReviewFieldDescriptor<SegmentResourceReviewField>[] = [
  field('itinerarySegmentId', '行程段', 'reference', z.string().trim().min(1).max(80), {
    editable: false,
  }),
  field('resourceKind', '资源种类', 'choice', z.enum(SEGMENT_RESOURCE_REVIEW_KINDS), {
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

export const SEGMENT_RESOURCE_REVIEW_SCHEMA: ReviewSchema<SegmentResourceReviewField> = {
  schemaId: 'departure.segment_resource',
  version: 1,
  payloadSchema: SEGMENT_RESOURCE_REVIEW_PAYLOAD_SCHEMA,
  targetKind: DEPARTURE_OBJECT_TARGET_KIND,
  confirmationUnits: [
    {
      key: SEGMENT_RESOURCE_CONFIRMATION_UNIT,
      label: '行程段资源审核',
      targetLabel: '行程段资源',
      fields: SEGMENT_RESOURCE_FIELDS,
    },
  ],
  parseCandidate: (candidate) => segmentResourceReviewCandidateSchema.parse(candidate),
}

export type SegmentResourceReviewDraft = {
  itinerarySegmentId: string
  resourceKind: SegmentResourceReviewKind
  supplierId: string
  title: string
  amountCents: number
  notes: string | null
}

export type SegmentResourceReviewWarning = {
  fieldKey: 'capacityWarning'
  message: string
}

export type SegmentResourceReviewResolution =
  | {
      status: 'ready'
      draft: SegmentResourceReviewDraft
      warnings: SegmentResourceReviewWarning[]
    }
  | {
      status: 'incomplete'
      missingFieldKeys: SegmentResourceReviewField[]
      reason: string
    }
  | {
      status: 'invalid'
      fieldKey: SegmentResourceReviewField
      reason: string
    }

const REQUIRED_WRITE_FIELDS = [
  'itinerarySegmentId',
  'resourceKind',
  'supplierId',
  'title',
  'amountCents',
] as const satisfies readonly SegmentResourceReviewField[]

function effectiveValue(
  candidates: readonly { fieldKey: string; proposedValue: unknown }[],
  corrections: Partial<Record<string, unknown>> | undefined,
  fieldKey: SegmentResourceReviewField,
): unknown {
  if (corrections && fieldKey in corrections) {
    return corrections[fieldKey]
  }
  const found = candidates.find((candidate) => candidate.fieldKey === fieldKey)
  return found?.proposedValue
}

export function resolveSegmentResourceReviewDraft(
  candidates: readonly { fieldKey: string; proposedValue: unknown }[],
  corrections?: Partial<Record<string, unknown>>,
): SegmentResourceReviewResolution {
  const itinerarySegmentId = effectiveValue(candidates, corrections, 'itinerarySegmentId')
  const resourceKind = effectiveValue(candidates, corrections, 'resourceKind')
  const supplierId = effectiveValue(candidates, corrections, 'supplierId')
  const title = effectiveValue(candidates, corrections, 'title')
  const amountCents = effectiveValue(candidates, corrections, 'amountCents')
  const notes = effectiveValue(candidates, corrections, 'notes')
  const capacityWarning = effectiveValue(candidates, corrections, 'capacityWarning')

  if (typeof itinerarySegmentId !== 'string' || itinerarySegmentId.trim() === '') {
    return {
      status: 'incomplete',
      missingFieldKeys: ['itinerarySegmentId'],
      reason: '材料未确定对应行程段，请核实归属，不能凭当前页面日期默认挂靠',
    }
  }

  const missing = REQUIRED_WRITE_FIELDS.filter((fieldKey) => {
    const value = effectiveValue(candidates, corrections, fieldKey)
    return value == null
  })
  if (missing.length > 0) {
    return {
      status: 'incomplete',
      missingFieldKeys: missing,
      reason: '行程段资源审核稿仍有待补充字段',
    }
  }

  if (typeof resourceKind !== 'string' || !SEGMENT_RESOURCE_REVIEW_KINDS.includes(resourceKind as SegmentResourceReviewKind)) {
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

  const warnings: SegmentResourceReviewWarning[] = []
  if (typeof capacityWarning === 'string' && capacityWarning.trim() !== '') {
    warnings.push({ fieldKey: 'capacityWarning', message: capacityWarning.trim() })
  }

  return {
    status: 'ready',
    draft: {
      itinerarySegmentId: itinerarySegmentId.trim(),
      resourceKind: resourceKind as SegmentResourceReviewKind,
      supplierId: supplierId.trim(),
      title: title.trim(),
      amountCents,
      notes: typeof notes === 'string' && notes.trim() !== '' ? notes.trim() : null,
    },
    warnings,
  }
}

export const submitSegmentResourceReviewModelInputSchema = z
  .object({
    objectVersion: z.number().int().positive(),
    confirmationUnit: z.literal(SEGMENT_RESOURCE_CONFIRMATION_UNIT).default(SEGMENT_RESOURCE_CONFIRMATION_UNIT),
    candidates: z.array(segmentResourceReviewCandidateSchema).min(1),
  })
  .strip()
  .refine(
    (value) => new Set(value.candidates.map((candidate) => candidate.fieldKey)).size === value.candidates.length,
    { message: '同一审核包内每个字段最多一条候选', path: ['candidates'] },
  )

export type SubmitSegmentResourceReviewModelInput = z.infer<
  typeof submitSegmentResourceReviewModelInputSchema
>

export const submitSegmentResourceReviewInputSchema = z
  .object({
    taskId: z.string().min(1),
    runId: z.string().min(1),
    objectVersion: z.number().int().positive(),
    confirmationUnit: z.literal(SEGMENT_RESOURCE_CONFIRMATION_UNIT).default(SEGMENT_RESOURCE_CONFIRMATION_UNIT),
    candidates: z.array(segmentResourceReviewCandidateSchema).min(1),
  })
  .strip()
  .refine(
    (value) => new Set(value.candidates.map((candidate) => candidate.fieldKey)).size === value.candidates.length,
    { message: '同一审核包内每个字段最多一条候选', path: ['candidates'] },
  )

export type SubmitSegmentResourceReviewInput = z.infer<typeof submitSegmentResourceReviewInputSchema>
