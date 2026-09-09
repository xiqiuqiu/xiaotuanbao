import { z } from 'zod'
import { AI_CANDIDATE_CLARITY, aiCandidateEvidenceSchema } from '../tools/review-package'
import {
  DEPARTURE_OBJECT_TARGET_KIND,
  SOURCE_ORDER_RECEIVABLE_CONFIRMATION_UNIT,
  SOURCE_ORDER_RECEIVABLE_REVIEW_PAYLOAD_SCHEMA,
} from './envelope'
import type {
  ReviewFieldControl,
  ReviewFieldDescriptor,
  ReviewSchema,
  ReviewSchemaCandidate,
} from './review-schema'

export {
  SOURCE_ORDER_RECEIVABLE_CONFIRMATION_UNIT,
  SOURCE_ORDER_RECEIVABLE_REVIEW_PAYLOAD_SCHEMA,
}

export const SOURCE_ORDER_RECEIVABLE_REVIEW_FIELD_KEYS = [
  'sourceOrderId',
  'displayName',
  'partnerName',
  'collectionMode',
  'netReceivableCents',
  'paths',
  'historyStatus',
  'historyMessage',
] as const

export type SourceOrderReceivableReviewFieldKey =
  (typeof SOURCE_ORDER_RECEIVABLE_REVIEW_FIELD_KEYS)[number]

export const SOURCE_ORDER_RECEIVABLE_HISTORY_STATUSES = [
  'ready',
  'no_positive_paths',
  'complete_and_consistent',
  'anomaly',
] as const

export type SourceOrderReceivableHistoryStatus =
  (typeof SOURCE_ORDER_RECEIVABLE_HISTORY_STATUSES)[number]

export const SOURCE_ORDER_RECEIVABLE_PATH_SOURCE_TYPES = [
  'source_order_customer_settlement',
  'source_order_guest_deposit_collection',
  'source_order_guest_balance_collection',
] as const

type SourceOrderReceivablePathSpec = {
  sourceType: string
  title: string
  amountCents: number
  counterpartyType: string
  counterpartyName?: string | null
}

type SourceOrderInitialReceivableClassification =
  | { status: 'ready'; paths: SourceOrderReceivablePathSpec[] }
  | { status: 'no_positive_paths' }
  | { status: 'complete_and_consistent'; scheduleIds: string[] }
  | { status: 'anomaly'; message: string }

export const sourceOrderReceivablePathCandidateSchema = z
  .object({
    sourceType: z.enum(SOURCE_ORDER_RECEIVABLE_PATH_SOURCE_TYPES),
    title: z.string().trim().min(1).max(80),
    amountCents: z.number().int().positive(),
    counterpartyType: z.enum(['partner', 'supplier', 'guest']),
    counterpartyName: z.string().trim().min(1).max(200).nullable(),
  })
  .strip()

export type SourceOrderReceivablePathCandidate = z.infer<
  typeof sourceOrderReceivablePathCandidateSchema
>

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
  risk: { level: 'high' as const, label: '提交约定应收，不是到账' },
}

function formatReviewValue(value: unknown): string {
  return value == null || value === '' ? '未填写' : String(value)
}

function formatCents(value: unknown): string {
  return typeof value === 'number' ? `${(value / 100).toFixed(2)} 元` : formatReviewValue(value)
}

function field(
  key: SourceOrderReceivableReviewFieldKey,
  label: string,
  control: ReviewFieldControl,
  valueSchema: z.ZodType,
  extra?: Partial<ReviewFieldDescriptor<SourceOrderReceivableReviewFieldKey>>,
): ReviewFieldDescriptor<SourceOrderReceivableReviewFieldKey> {
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

const SOURCE_ORDER_RECEIVABLE_FIELDS: readonly ReviewFieldDescriptor<SourceOrderReceivableReviewFieldKey>[] =
  [
    field('sourceOrderId', '客源单', 'text', z.string().trim().min(1).max(80)),
    field('displayName', '客源名称', 'text', z.string().trim().min(1).max(200)),
    field('partnerName', '收款对象', 'text', z.string().trim().min(1).max(200)),
    field('collectionMode', '收款方式', 'choice', z.enum(['partner_settled', 'guest_only', 'split']), {
      options: [
        { label: '客户结算', value: 'partner_settled' },
        { label: '全部我方代收', value: 'guest_only' },
        { label: '分拆收款', value: 'split' },
      ],
      format: (value) =>
        value === 'partner_settled'
          ? '客户结算'
          : value === 'guest_only'
            ? '全部我方代收'
            : value === 'split'
              ? '分拆收款'
              : formatReviewValue(value),
    }),
    field('netReceivableCents', '结算金额（约定）', 'integer', z.number().int().min(0), {
      format: formatCents,
    }),
    field('paths', '适用约定应收', 'list', z.array(sourceOrderReceivablePathCandidateSchema), {
      format: (value) => (Array.isArray(value) ? `${value.length} 笔约定应收` : formatReviewValue(value)),
    }),
    field(
      'historyStatus',
      '已有账款',
      'choice',
      z.enum(SOURCE_ORDER_RECEIVABLE_HISTORY_STATUSES),
      {
        options: [
          { label: '可提交', value: 'ready' },
          { label: '无需生成', value: 'no_positive_paths' },
          { label: '已有完整记录', value: 'complete_and_consistent' },
          { label: '历史异常', value: 'anomaly' },
        ],
      },
    ),
    field('historyMessage', '账款说明', 'text', z.string().trim().min(1).max(500)),
  ]

const FIELD_BY_KEY = Object.fromEntries(
  SOURCE_ORDER_RECEIVABLE_FIELDS.map((item) => [item.key, item]),
) as Record<
  SourceOrderReceivableReviewFieldKey,
  ReviewFieldDescriptor<SourceOrderReceivableReviewFieldKey>
>

export const sourceOrderReceivableReviewCandidateSchema = z
  .object({
    fieldKey: z.enum(SOURCE_ORDER_RECEIVABLE_REVIEW_FIELD_KEYS),
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

export function parseSourceOrderReceivableReviewCandidate(candidate: unknown): ReviewSchemaCandidate {
  const parsed = sourceOrderReceivableReviewCandidateSchema.parse(candidate)
  return {
    fieldKey: parsed.fieldKey,
    proposedValue: parsed.proposedValue,
    clarity: parsed.clarity,
    evidence: parsed.evidence,
  }
}

export const SOURCE_ORDER_RECEIVABLE_REVIEW_SCHEMA: ReviewSchema<SourceOrderReceivableReviewFieldKey> =
  {
    schemaId: 'source_order.receivable',
    version: 1,
    payloadSchema: SOURCE_ORDER_RECEIVABLE_REVIEW_PAYLOAD_SCHEMA,
    targetKind: DEPARTURE_OBJECT_TARGET_KIND,
    confirmationUnits: [
      {
        key: SOURCE_ORDER_RECEIVABLE_CONFIRMATION_UNIT,
        label: '初始应收审核',
        targetLabel: '客源单适用约定应收',
        fields: SOURCE_ORDER_RECEIVABLE_FIELDS,
      },
    ],
    parseCandidate: parseSourceOrderReceivableReviewCandidate,
  }

const FORMAL_SOURCE_EVIDENCE = [
  { kind: 'system_derivation' as const, rule: '正式客源单当前收款约定' },
]

function pathCandidate(path: SourceOrderReceivablePathSpec): SourceOrderReceivablePathCandidate {
  return {
    sourceType: path.sourceType as SourceOrderReceivablePathCandidate['sourceType'],
    title: path.title,
    amountCents: path.amountCents,
    counterpartyType: path.counterpartyType as SourceOrderReceivablePathCandidate['counterpartyType'],
    counterpartyName: path.counterpartyName ?? null,
  }
}

export function historyStatusFromClassification(
  classification: SourceOrderInitialReceivableClassification,
): SourceOrderReceivableHistoryStatus {
  if (classification.status === 'anomaly') return 'anomaly'
  return classification.status
}

export function sourceOrderReceivableReviewCandidates(input: {
  sourceOrderId: string
  displayName: string
  partnerName: string
  collectionMode: 'partner_settled' | 'guest_only' | 'split' | string
  netReceivableCents: number
  paths: SourceOrderReceivablePathSpec[]
  classification: SourceOrderInitialReceivableClassification
}): Array<{
  fieldKey: SourceOrderReceivableReviewFieldKey
  proposedValue: unknown
  clarity: 'clear'
  evidence: typeof FORMAL_SOURCE_EVIDENCE
}> {
  const historyMessage =
    input.classification.status === 'ready'
      ? '以下为约定应收，确认后整单提交；不是到账或流水。'
      : input.classification.status === 'no_positive_paths'
        ? '当前约定没有正金额应收路径，无需生成应收。'
        : input.classification.status === 'complete_and_consistent'
          ? '已有应收与当前约定完整且一致，确认后展示已有记录，不会重复提交。'
          : input.classification.message

  const candidates: Array<{
    fieldKey: SourceOrderReceivableReviewFieldKey
    proposedValue: unknown
  }> = [
    { fieldKey: 'sourceOrderId', proposedValue: input.sourceOrderId },
    { fieldKey: 'displayName', proposedValue: input.displayName },
    { fieldKey: 'partnerName', proposedValue: input.partnerName },
    { fieldKey: 'collectionMode', proposedValue: input.collectionMode },
    { fieldKey: 'netReceivableCents', proposedValue: input.netReceivableCents },
    {
      fieldKey: 'paths',
      proposedValue: input.paths.filter((path) => path.amountCents > 0).map(pathCandidate),
    },
    {
      fieldKey: 'historyStatus',
      proposedValue: historyStatusFromClassification(input.classification),
    },
    { fieldKey: 'historyMessage', proposedValue: historyMessage },
  ]
  return candidates.map((candidate) => ({
    ...candidate,
    clarity: 'clear' as const,
    evidence: FORMAL_SOURCE_EVIDENCE,
  }))
}

export function requiredPermissionKeyForReviewPayloadSchema(
  payloadSchema: string | null | undefined,
): string {
  if (payloadSchema === SOURCE_ORDER_RECEIVABLE_REVIEW_PAYLOAD_SCHEMA) {
    return '/departure'
  }
  return 'departure:write'
}
