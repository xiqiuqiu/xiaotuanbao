import type { ZodType } from 'zod'
import {
  AI_REVIEW_CONFIRMATION_UNIT,
  AI_REVIEWABLE_BASIC_INFO_FIELDS,
  aiReviewCandidateInputSchema,
  type AiReviewCandidateInput,
  type AiReviewableBasicInfoField,
} from '../tools/review-package'
import {
  DEPARTURE_REVIEW_PAYLOAD_SCHEMA,
  DEPARTURE_REVIEW_TARGET_KIND,
} from './envelope'

export type ReviewFieldControl = 'text' | 'date' | 'integer' | 'choice' | 'reference'
export type ReviewRiskLevel = 'standard' | 'sensitive' | 'high'
export type ReviewSchemaCandidate = {
  fieldKey: string
  proposedValue: string | number
  clarity: AiReviewCandidateInput['clarity']
  evidence: AiReviewCandidateInput['evidence']
}

export type ReviewFieldDescriptor<FieldKey extends string = string> = {
  key: FieldKey
  label: string
  control: ReviewFieldControl
  editable: boolean
  valueSchema: ZodType
  number?: { min?: number; max?: number; precision?: number }
  options?: readonly { label: string; value: string }[]
  format: (value: unknown) => string
  evidence: {
    presentation: 'expandable'
    label: string
    format: (items: AiReviewCandidateInput['evidence']) => string
  }
  risk: { level: ReviewRiskLevel; label: string }
}

export type ReviewConfirmationUnitDescriptor<FieldKey extends string = string> = {
  key: string
  label: string
  targetLabel: string
  fields: readonly ReviewFieldDescriptor<FieldKey>[]
}

export type ReviewSchema<FieldKey extends string = string> = {
  schemaId: string
  version: number
  payloadSchema: string
  targetKind: string
  confirmationUnits: readonly ReviewConfirmationUnitDescriptor<FieldKey>[]
  parseCandidate: (candidate: unknown) => ReviewSchemaCandidate
}

export class UnsupportedReviewSchemaError extends Error {
  readonly code = 'UNSUPPORTED_REVIEW_SCHEMA'

  constructor(readonly payloadSchema: string) {
    super(`不支持的 Review Schema: ${payloadSchema}`)
    this.name = 'UnsupportedReviewSchemaError'
  }
}

export class ReviewSchemaRegistry {
  private readonly byPayloadSchema = new Map<string, ReviewSchema>()

  constructor(schemas: readonly ReviewSchema[]) {
    for (const schema of schemas) {
      if (this.byPayloadSchema.has(schema.payloadSchema)) {
        throw new Error(`重复登记 Review Schema: ${schema.payloadSchema}`)
      }
      this.byPayloadSchema.set(schema.payloadSchema, schema)
    }
  }

  findByPayloadSchema(payloadSchema: string): ReviewSchema | undefined {
    return this.byPayloadSchema.get(payloadSchema)
  }

  requireByPayloadSchema(payloadSchema: string): ReviewSchema {
    const schema = this.findByPayloadSchema(payloadSchema)
    if (!schema) throw new UnsupportedReviewSchemaError(payloadSchema)
    return schema
  }

  requireConfirmationUnit(payloadSchema: string, confirmationUnit: string) {
    const schema = this.requireByPayloadSchema(payloadSchema)
    const unit = schema.confirmationUnits.find((candidate) => candidate.key === confirmationUnit)
    if (!unit) throw new UnsupportedReviewSchemaError(`${payloadSchema}#${confirmationUnit}`)
    return { schema, unit }
  }
}

const commonPresentation = {
  editable: true,
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

function departureField(
  key: AiReviewableBasicInfoField,
  label: string,
  control: ReviewFieldControl,
  number?: ReviewFieldDescriptor['number'],
  options?: ReviewFieldDescriptor['options'],
): ReviewFieldDescriptor<AiReviewableBasicInfoField> {
  const option = aiReviewCandidateInputSchema.options.find(
    (candidate) => candidate.shape.fieldKey.value === key,
  )
  if (!option) throw new Error(`发团审核字段缺少 Schema: ${key}`)
  return {
    key,
    label,
    control,
    valueSchema: option.shape.proposedValue,
    ...(number ? { number } : {}),
    ...(options ? { options } : {}),
    format: (value) =>
      options?.find((option) => option.value === value)?.label ?? formatReviewValue(value),
    ...commonPresentation,
    editable: control !== 'reference',
  }
}

const DEPARTURE_BASIC_INFO_FIELDS = [
  departureField('name', '团名', 'text'),
  departureField('routeName', '路线', 'text'),
  departureField('templateId', '常用路线', 'reference'),
  departureField('startDate', '出团日期', 'date'),
  departureField('endDate', '结束日期', 'date'),
  departureField('departureType', '发团类型', 'choice', undefined, [
    { label: '拼团', value: 'combined' },
    { label: '独立团', value: 'independent' },
  ]),
  departureField('notes', '备注', 'text'),
  departureField('vehiclePlate', '车牌', 'text'),
  departureField('contactPhone', '联系电话', 'text'),
  departureField('expectedGuestCountHint', '预计人数提示', 'integer', {
    min: 0,
    max: 9999,
    precision: 0,
  }),
] as const

if (DEPARTURE_BASIC_INFO_FIELDS.length !== AI_REVIEWABLE_BASIC_INFO_FIELDS.length) {
  throw new Error('发团 Review Schema 字段目录不完整')
}

export const DEPARTURE_BASIC_INFO_REVIEW_SCHEMA: ReviewSchema<AiReviewableBasicInfoField> = {
  schemaId: 'departure.basic_info_draft',
  version: 1,
  payloadSchema: DEPARTURE_REVIEW_PAYLOAD_SCHEMA,
  targetKind: DEPARTURE_REVIEW_TARGET_KIND,
  confirmationUnits: [
    {
      key: AI_REVIEW_CONFIRMATION_UNIT,
      label: '基础信息审核',
      targetLabel: '发团创建草稿',
      fields: DEPARTURE_BASIC_INFO_FIELDS,
    },
  ],
  parseCandidate: (candidate) => aiReviewCandidateInputSchema.parse(candidate),
}

export const registeredReviewSchemas = new ReviewSchemaRegistry([
  DEPARTURE_BASIC_INFO_REVIEW_SCHEMA,
])

export function resolveReviewField(
  payloadSchema: string,
  confirmationUnit: string,
  fieldKey: string,
): ReviewFieldDescriptor | undefined {
  const schema = registeredReviewSchemas.findByPayloadSchema(payloadSchema)
  const unit = schema?.confirmationUnits.find((candidate) => candidate.key === confirmationUnit)
  return unit?.fields.find((field) => field.key === fieldKey)
}
