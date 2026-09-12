import { z } from 'zod'
import { AI_CANDIDATE_CLARITY, aiCandidateEvidenceSchema } from '../tools/review-package'
import {
  DEPARTURE_OBJECT_TARGET_KIND,
  RESOURCE_PAYABLE_CONFIRMATION_UNIT,
  RESOURCE_PAYABLE_REVIEW_PAYLOAD_SCHEMA,
} from './envelope'
import type {
  ReviewFieldControl,
  ReviewFieldDescriptor,
  ReviewSchema,
  ReviewSchemaCandidate,
} from './review-schema'

export {
  RESOURCE_PAYABLE_CONFIRMATION_UNIT,
  RESOURCE_PAYABLE_REVIEW_PAYLOAD_SCHEMA,
}

export const RESOURCE_PAYABLE_REVIEW_FIELD_KEYS = [
  'sourceType',
  'sourceId',
  'title',
  'resourceKind',
  'supplierName',
  'amountCents',
  'historyStatus',
  'historyMessage',
] as const

export type ResourcePayableReviewFieldKey = (typeof RESOURCE_PAYABLE_REVIEW_FIELD_KEYS)[number]

export const RESOURCE_PAYABLE_HISTORY_STATUSES = [
  'ready',
  'no_positive_amount',
  'complete_and_consistent',
  'anomaly',
] as const

export type ResourcePayableHistoryStatus = (typeof RESOURCE_PAYABLE_HISTORY_STATUSES)[number]

export const RESOURCE_PAYABLE_SOURCE_TYPES = ['segment_resource', 'departure_resource'] as const

type ResourceInitialPayableClassification =
  | { status: 'ready'; amountCents: number }
  | { status: 'no_positive_amount' }
  | { status: 'complete_and_consistent'; scheduleIds: string[] }
  | { status: 'anomaly'; message: string }

const evidenceListSchema = z.array(aiCandidateEvidenceSchema).min(1)

const commonPresentation = {
  evidence: {
    presentation: 'expandable' as const,
    label: '查看证据',
    format: (items: Array<{ kind: string; excerpt?: string; rule?: string }>) =>
      items
        .map((item) => {
          if ('excerpt' in item && item.excerpt) return item.excerpt
          if ('rule' in item && item.rule) return item.rule
          return ''
        })
        .filter(Boolean)
        .join('；'),
  },
  risk: { level: 'high' as const, label: '提交约定应付，不是付款' },
}

function formatReviewValue(value: unknown): string {
  return value == null || value === '' ? '未填写' : String(value)
}

function formatCents(value: unknown): string {
  return typeof value === 'number' ? `${(value / 100).toFixed(2)} 元` : formatReviewValue(value)
}

function field(
  key: ResourcePayableReviewFieldKey,
  label: string,
  control: ReviewFieldControl,
  valueSchema: z.ZodType,
  extra?: Partial<ReviewFieldDescriptor<ResourcePayableReviewFieldKey>>,
): ReviewFieldDescriptor<ResourcePayableReviewFieldKey> {
  return {
    key,
    label,
    control,
    editable: false,
    valueSchema,
    format: extra?.format ?? formatReviewValue,
    ...commonPresentation,
    ...extra,
  }
}

const RESOURCE_PAYABLE_FIELDS: readonly ReviewFieldDescriptor<ResourcePayableReviewFieldKey>[] = [
  field('sourceType', '资源来源', 'choice', z.enum(RESOURCE_PAYABLE_SOURCE_TYPES), {
    options: [
      { label: '行程段资源', value: 'segment_resource' },
      { label: '发团级资源', value: 'departure_resource' },
    ],
    format: (value) =>
      value === 'segment_resource'
        ? '行程段资源'
        : value === 'departure_resource'
          ? '发团级资源'
          : formatReviewValue(value),
  }),
  field('sourceId', '正式资源', 'text', z.string().trim().min(1).max(80)),
  field('title', '资源名称', 'text', z.string().trim().min(1).max(200)),
  field('resourceKind', '资源种类', 'text', z.string().trim().min(1).max(40)),
  field('supplierName', '供应商', 'text', z.string().trim().min(1).max(200)),
  field('amountCents', '约定总价', 'integer', z.number().int().nonnegative(), {
    format: formatCents,
  }),
  field('historyStatus', '已有账款', 'choice', z.enum(RESOURCE_PAYABLE_HISTORY_STATUSES), {
    options: [
      { label: '可提交', value: 'ready' },
      { label: '无需生成', value: 'no_positive_amount' },
      { label: '已有完整记录', value: 'complete_and_consistent' },
      { label: '历史异常', value: 'anomaly' },
    ],
  }),
  field('historyMessage', '账款说明', 'text', z.string().trim().min(1).max(500)),
]

const FIELD_BY_KEY = Object.fromEntries(
  RESOURCE_PAYABLE_FIELDS.map((item) => [item.key, item]),
) as Record<ResourcePayableReviewFieldKey, ReviewFieldDescriptor<ResourcePayableReviewFieldKey>>

export const resourcePayableReviewCandidateSchema = z
  .object({
    fieldKey: z.enum(RESOURCE_PAYABLE_REVIEW_FIELD_KEYS),
    proposedValue: z.unknown(),
    clarity: z.enum(AI_CANDIDATE_CLARITY),
    evidence: evidenceListSchema,
  })
  .strip()
  .superRefine((value, ctx) => {
    if (value.proposedValue === null) return
    const descriptor = FIELD_BY_KEY[value.fieldKey]
    if (!descriptor.valueSchema.safeParse(value.proposedValue).success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `审核候选值无效：${descriptor.label}`,
        path: ['proposedValue'],
      })
    }
  })

export function parseResourcePayableReviewCandidate(candidate: unknown): ReviewSchemaCandidate {
  const parsed = resourcePayableReviewCandidateSchema.parse(candidate)
  return {
    fieldKey: parsed.fieldKey,
    proposedValue: parsed.proposedValue,
    clarity: parsed.clarity,
    evidence: parsed.evidence,
  }
}

export const RESOURCE_PAYABLE_REVIEW_SCHEMA: ReviewSchema<ResourcePayableReviewFieldKey> = {
  schemaId: 'resource.payable',
  version: 1,
  payloadSchema: RESOURCE_PAYABLE_REVIEW_PAYLOAD_SCHEMA,
  targetKind: DEPARTURE_OBJECT_TARGET_KIND,
  confirmationUnits: [
    {
      key: RESOURCE_PAYABLE_CONFIRMATION_UNIT,
      label: '初始应付审核',
      targetLabel: '所选资源约定应付',
      fields: RESOURCE_PAYABLE_FIELDS,
    },
  ],
  parseCandidate: parseResourcePayableReviewCandidate,
}

const FORMAL_SOURCE_EVIDENCE = [{ kind: 'system_derivation' as const, rule: '正式资源当前约定应付' }]

export function historyStatusFromPayableClassification(
  classification: ResourceInitialPayableClassification,
): ResourcePayableHistoryStatus {
  if (classification.status === 'anomaly') return 'anomaly'
  return classification.status
}

export function resourcePayableReviewCandidates(input: {
  sourceType: 'segment_resource' | 'departure_resource' | string
  sourceId: string
  title: string
  resourceKind: string
  supplierName: string
  amountCents: number
  classification: ResourceInitialPayableClassification
}): Array<{
  fieldKey: ResourcePayableReviewFieldKey
  proposedValue: unknown
  clarity: 'clear'
  evidence: typeof FORMAL_SOURCE_EVIDENCE
}> {
  const historyMessage =
    input.classification.status === 'ready'
      ? '以下为约定应付，确认后按该项提交；不是付款或流水。'
      : input.classification.status === 'no_positive_amount'
        ? '当前资源没有正金额，无需生成应付。'
        : input.classification.status === 'complete_and_consistent'
          ? '已有应付与当前约定完整且一致，确认后展示已有记录，不会重复提交。'
          : input.classification.message

  const candidates: Array<{
    fieldKey: ResourcePayableReviewFieldKey
    proposedValue: unknown
  }> = [
    { fieldKey: 'sourceType', proposedValue: input.sourceType },
    { fieldKey: 'sourceId', proposedValue: input.sourceId },
    { fieldKey: 'title', proposedValue: input.title },
    { fieldKey: 'resourceKind', proposedValue: input.resourceKind },
    { fieldKey: 'supplierName', proposedValue: input.supplierName },
    { fieldKey: 'amountCents', proposedValue: input.amountCents },
    {
      fieldKey: 'historyStatus',
      proposedValue: historyStatusFromPayableClassification(input.classification),
    },
    { fieldKey: 'historyMessage', proposedValue: historyMessage },
  ]
  return candidates.map((candidate) => ({
    ...candidate,
    clarity: 'clear' as const,
    evidence: FORMAL_SOURCE_EVIDENCE,
  }))
}
