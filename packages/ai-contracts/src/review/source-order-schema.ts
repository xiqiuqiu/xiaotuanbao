import { z } from 'zod'
import { AI_CANDIDATE_CLARITY, aiCandidateEvidenceSchema } from '../tools/review-package'
import {
  DEPARTURE_OBJECT_TARGET_KIND,
  SOURCE_ORDER_REVIEW_CONFIRMATION_UNIT,
  SOURCE_ORDER_REVIEW_PAYLOAD_SCHEMA,
} from './envelope'
import type {
  ReviewFieldControl,
  ReviewFieldDescriptor,
  ReviewSchema,
  ReviewSchemaCandidate,
} from './review-schema'

export const SOURCE_ORDER_REVIEW_GROUPS = [
  'quote',
  'adjustments',
  'discount',
  'collection',
  'guests',
] as const
export type SourceOrderReviewGroup = (typeof SOURCE_ORDER_REVIEW_GROUPS)[number]

export const SOURCE_ORDER_REVIEW_FIELD_KEYS = [
  'partnerId',
  'adultGuestCount',
  'childGuestCount',
  'adultUnitPriceCents',
  'childUnitPriceCents',
  'fareAdjustments',
  'discountType',
  'discountCents',
  'discountNotes',
  'collectionMode',
  'depositCents',
  'balanceCents',
  'settlementNotes',
  'notes',
  'guests',
] as const
export type SourceOrderReviewFieldKey = (typeof SOURCE_ORDER_REVIEW_FIELD_KEYS)[number]

export const SOURCE_ORDER_REVIEW_GROUP_LABELS: Record<SourceOrderReviewGroup, string> = {
  quote: '客户与报价',
  adjustments: '团款调整',
  discount: '团款优惠',
  collection: '收款约定',
  guests: '客人名单',
}

const SOURCE_ORDER_FARE_ADJUSTMENT_KINDS = [
  'child_ticket_topup',
  'single_room_topup',
  'extended_stay',
  'ticket_discount_refund',
  'lodging_deduction',
  'other',
] as const

export const sourceOrderFareAdjustmentCandidateSchema = z
  .object({
    kind: z.enum(SOURCE_ORDER_FARE_ADJUSTMENT_KINDS),
    direction: z.enum(['increase', 'decrease']),
    amountCents: z.number().int().positive(),
    customName: z.string().trim().max(200).nullable().optional(),
  })
  .strip()

export const sourceOrderGuestCandidateSchema = z
  .object({
    name: z.string().trim().max(80),
    phone: z.string().trim().max(32).nullable().optional(),
    gender: z.enum(['male', 'female', 'unknown']).nullable().optional(),
    notes: z.string().trim().max(500).nullable().optional(),
    included: z.boolean().optional(),
  })
  .strip()

const evidenceListSchema = z.array(aiCandidateEvidenceSchema).min(1)

const commonPresentation = {
  editable: true,
  evidence: {
    presentation: 'expandable' as const,
    label: '查看证据',
    format: (items: ReviewSchemaCandidate['evidence']) =>
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

function formatCents(value: unknown): string {
  if (value == null || value === '') return '未填写'
  if (typeof value !== 'number' || !Number.isFinite(value)) return formatReviewValue(value)
  return `${(value / 100).toFixed(2)} 元`
}

function sourceOrderField(
  key: SourceOrderReviewFieldKey,
  label: string,
  group: SourceOrderReviewGroup,
  control: ReviewFieldControl,
  valueSchema: ReviewFieldDescriptor['valueSchema'],
  options?: ReviewFieldDescriptor['options'],
  format: ReviewFieldDescriptor['format'] = formatReviewValue,
): ReviewFieldDescriptor<SourceOrderReviewFieldKey> {
  return {
    key,
    label,
    control,
    valueSchema,
    ...(options ? { options } : {}),
    format,
    group,
    ...commonPresentation,
    editable: control !== 'reference' || key === 'partnerId',
  }
}

const nullableInt = z.number().int().min(0)
const nullableMoney = z.number().int().min(0)

export const SOURCE_ORDER_REVIEW_FIELDS: readonly ReviewFieldDescriptor<SourceOrderReviewFieldKey>[] =
  [
    sourceOrderField('partnerId', '客户', 'quote', 'reference', z.string().min(1).max(200)),
    sourceOrderField('adultGuestCount', '成人人数', 'quote', 'integer', nullableInt, undefined, formatReviewValue),
    sourceOrderField('childGuestCount', '儿童人数', 'quote', 'integer', nullableInt, undefined, formatReviewValue),
    sourceOrderField(
      'adultUnitPriceCents',
      '成人单价',
      'quote',
      'integer',
      nullableMoney,
      undefined,
      formatCents,
    ),
    sourceOrderField(
      'childUnitPriceCents',
      '儿童单价',
      'quote',
      'integer',
      nullableMoney,
      undefined,
      formatCents,
    ),
    sourceOrderField(
      'fareAdjustments',
      '团款调整',
      'adjustments',
      'list',
      z.array(sourceOrderFareAdjustmentCandidateSchema),
      undefined,
      (value) => (Array.isArray(value) ? `${value.length} 行` : formatReviewValue(value)),
    ),
    sourceOrderField('discountType', '优惠方式', 'discount', 'choice', z.enum(['none', 'lump_sum']), [
      { label: '无优惠', value: 'none' },
      { label: '整单优惠', value: 'lump_sum' },
    ]),
    sourceOrderField(
      'discountCents',
      '优惠金额',
      'discount',
      'integer',
      nullableMoney,
      undefined,
      formatCents,
    ),
    sourceOrderField('discountNotes', '优惠备注', 'discount', 'text', z.string().trim().max(500)),
    sourceOrderField(
      'collectionMode',
      '收款方式',
      'collection',
      'choice',
      z.enum(['partner_settled', 'guest_only', 'split']),
      [
        { label: '客户结算', value: 'partner_settled' },
        { label: '全部我方代收', value: 'guest_only' },
        { label: '分拆收款', value: 'split' },
      ],
    ),
    sourceOrderField('depositCents', '定金', 'collection', 'integer', nullableMoney, undefined, formatCents),
    sourceOrderField('balanceCents', '尾款', 'collection', 'integer', nullableMoney, undefined, formatCents),
    sourceOrderField('settlementNotes', '结算说明', 'collection', 'text', z.string().trim().max(5000)),
    sourceOrderField('notes', '业务备注', 'collection', 'text', z.string().trim().max(5000)),
    sourceOrderField(
      'guests',
      '客人名单',
      'guests',
      'list',
      z.array(sourceOrderGuestCandidateSchema),
      undefined,
      (value) => (Array.isArray(value) ? `${value.length} 人` : formatReviewValue(value)),
    ),
  ]

const FIELD_BY_KEY = Object.fromEntries(
  SOURCE_ORDER_REVIEW_FIELDS.map((field) => [field.key, field]),
) as Record<SourceOrderReviewFieldKey, ReviewFieldDescriptor<SourceOrderReviewFieldKey>>

export const sourceOrderReviewCandidateInputSchema = z
  .object({
    fieldKey: z.enum(SOURCE_ORDER_REVIEW_FIELD_KEYS),
    proposedValue: z.unknown(),
    clarity: z.enum(AI_CANDIDATE_CLARITY),
    evidence: evidenceListSchema,
  })
  .strip()
  .superRefine((value, ctx) => {
    if (value.proposedValue === null) return
    const field = FIELD_BY_KEY[value.fieldKey]
    if (!field.valueSchema.safeParse(value.proposedValue).success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `审核候选值无效：${field.label}`,
        path: ['proposedValue'],
      })
    }
  })

export function parseSourceOrderReviewCandidate(candidate: unknown): ReviewSchemaCandidate {
  const parsed = sourceOrderReviewCandidateInputSchema.parse(candidate)
  return {
    fieldKey: parsed.fieldKey,
    proposedValue: parsed.proposedValue,
    clarity: parsed.clarity,
    evidence: parsed.evidence,
  }
}

export const SOURCE_ORDER_CREATE_REVIEW_SCHEMA: ReviewSchema<SourceOrderReviewFieldKey> = {
  schemaId: 'source_order.create',
  version: 1,
  payloadSchema: SOURCE_ORDER_REVIEW_PAYLOAD_SCHEMA,
  targetKind: DEPARTURE_OBJECT_TARGET_KIND,
  confirmationUnits: [
    {
      key: SOURCE_ORDER_REVIEW_CONFIRMATION_UNIT,
      label: '客源单审核',
      targetLabel: '客源单及选定名单',
      fields: SOURCE_ORDER_REVIEW_FIELDS,
    },
  ],
  parseCandidate: parseSourceOrderReviewCandidate,
}

export function isSourceOrderReviewConfirmationUnit(confirmationUnit: string): boolean {
  return confirmationUnit === SOURCE_ORDER_REVIEW_CONFIRMATION_UNIT
}

function uniqueFieldKeys(candidates: Array<{ fieldKey: string }>): boolean {
  const keys = candidates.map((candidate) => candidate.fieldKey)
  return new Set(keys).size === keys.length
}

const UNIQUE_FIELD_KEY_MESSAGE = '同一审核包内每个字段最多一条候选'

export const submitSourceOrderReviewPackageModelInputSchema = z
  .object({
    objectVersion: z.number().int().positive(),
    confirmationUnit: z.literal(SOURCE_ORDER_REVIEW_CONFIRMATION_UNIT),
    candidates: z.array(sourceOrderReviewCandidateInputSchema).min(1),
  })
  .strip()
  .refine((value) => uniqueFieldKeys(value.candidates), {
    message: UNIQUE_FIELD_KEY_MESSAGE,
    path: ['candidates'],
  })

export const submitSourceOrderReviewPackageInputSchema = z
  .object({
    taskId: z.string().min(1),
    runId: z.string().min(1),
    objectVersion: z.number().int().positive(),
    confirmationUnit: z.literal(SOURCE_ORDER_REVIEW_CONFIRMATION_UNIT),
    candidates: z.array(sourceOrderReviewCandidateInputSchema).min(1),
  })
  .strip()
  .refine((value) => uniqueFieldKeys(value.candidates), {
    message: UNIQUE_FIELD_KEY_MESSAGE,
    path: ['candidates'],
  })

export type SubmitSourceOrderReviewPackageModelInput = z.infer<
  typeof submitSourceOrderReviewPackageModelInputSchema
>
export type SubmitSourceOrderReviewPackageInput = z.infer<
  typeof submitSourceOrderReviewPackageInputSchema
>
