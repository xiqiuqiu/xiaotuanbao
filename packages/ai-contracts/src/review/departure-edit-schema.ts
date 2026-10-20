import { z } from 'zod'
import { aiCandidateEvidenceSchema, AI_CANDIDATE_CLARITY } from '../tools/review-package'
import { DEPARTURE_OBJECT_TARGET_KIND } from './envelope'
import type { ReviewFieldDescriptor, ReviewSchema } from './review-schema'

export const ITINERARY_SEGMENT_UPDATE_REVIEW_PAYLOAD_SCHEMA = 'departure.itinerary_segment_update@v1' as const
export const ITINERARY_SEGMENT_UPDATE_CONFIRMATION_UNIT = 'itinerary_segment_update' as const
export const SOURCE_ORDER_GUESTS_UPDATE_REVIEW_PAYLOAD_SCHEMA = 'source_order.guests_update@v1' as const
export const SOURCE_ORDER_GUESTS_UPDATE_CONFIRMATION_UNIT = 'source_order_guests_update' as const

const reference = z.string().trim().min(1).max(80)
const guestFields = {
  name: z.string().trim().min(1).max(80),
  phone: z.string().trim().max(32).nullable().optional(),
  gender: z.enum(['male', 'female', 'unknown']).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
}
export const sourceOrderGuestAddSchema = z.object(guestFields).strict()
export const sourceOrderGuestUpdateSchema = z.object({
  guestId: reference,
  ...guestFields,
  name: guestFields.name.optional(),
}).strict().refine((value) => Object.keys(value).some((key) => key !== 'guestId'), {
  message: '每位游客必须至少修改一个字段',
})
export const sourceOrderGuestChangesSchema = z.object({
  add: z.array(sourceOrderGuestAddSchema).max(500).optional(),
  update: z.array(sourceOrderGuestUpdateSchema).max(500).optional(),
}).strict().refine((value) => (value.add?.length ?? 0) + (value.update?.length ?? 0) > 0, {
  message: '至少追加或修改一位游客',
}).refine((value) => new Set(value.update?.map((guest) => guest.guestId)).size === (value.update?.length ?? 0), {
  message: '同一游客只能修改一次', path: ['update'],
})
export type SourceOrderGuestChanges = z.infer<typeof sourceOrderGuestChangesSchema>

const candidateBase = {
  clarity: z.enum(AI_CANDIDATE_CLARITY),
  evidence: z.array(aiCandidateEvidenceSchema).min(1),
}
const storedCandidateSchema = z.object({ fieldKey: z.string(), proposedValue: z.unknown(), ...candidateBase }).strip()
const date = z.string().date().nullable()
const count = z.number().int().nonnegative()
export const itinerarySegmentUpdateReviewCandidateSchema = z.discriminatedUnion('fieldKey', [
  z.object({ fieldKey: z.literal('itinerarySegmentId'), proposedValue: reference, ...candidateBase }).strict(),
  z.object({ fieldKey: z.literal('name'), proposedValue: z.string().trim().min(1).max(200), ...candidateBase }).strict(),
  z.object({ fieldKey: z.literal('destination'), proposedValue: z.string().trim().max(200).nullable(), ...candidateBase }).strict(),
  z.object({ fieldKey: z.literal('startDate'), proposedValue: date, ...candidateBase }).strict(),
  z.object({ fieldKey: z.literal('endDate'), proposedValue: date, ...candidateBase }).strict(),
  z.object({ fieldKey: z.literal('notes'), proposedValue: z.string().trim().max(5000).nullable(), ...candidateBase }).strict(),
  z.object({ fieldKey: z.literal('fullTicketCount'), proposedValue: count, ...candidateBase }).strict(),
  z.object({ fieldKey: z.literal('halfTicketCount'), proposedValue: count, ...candidateBase }).strict(),
  z.object({ fieldKey: z.literal('studentTicketCount'), proposedValue: count, ...candidateBase }).strict(),
  z.object({ fieldKey: z.literal('freeTicketCount'), proposedValue: count, ...candidateBase }).strict(),
])
export const sourceOrderGuestsUpdateReviewCandidateSchema = z.discriminatedUnion('fieldKey', [
  z.object({ fieldKey: z.literal('sourceOrderId'), proposedValue: reference, ...candidateBase }).strict(),
  z.object({ fieldKey: z.literal('guestChanges'), proposedValue: sourceOrderGuestChangesSchema, ...candidateBase }).strict(),
])
export type ItinerarySegmentUpdateReviewCandidate = z.infer<typeof itinerarySegmentUpdateReviewCandidateSchema>
export type SourceOrderGuestsUpdateReviewCandidate = z.infer<typeof sourceOrderGuestsUpdateReviewCandidateSchema>

function reviewFields(schema: typeof itinerarySegmentUpdateReviewCandidateSchema | typeof sourceOrderGuestsUpdateReviewCandidateSchema,
  labels: Record<string, string>): ReviewFieldDescriptor[] {
  return schema.options.map((option) => {
    const key = option.shape.fieldKey.value
    const isReference = key === 'itinerarySegmentId' || key === 'sourceOrderId'
    return {
      key, label: labels[key]!, editable: !isReference,
      control: isReference ? 'reference' : key === 'guestChanges' ? 'list' : key.endsWith('Count') ? 'integer' : key.endsWith('Date') ? 'date' : 'text',
      valueSchema: option.shape.proposedValue,
      format: (value) => value == null ? '清空' : typeof value === 'object' ? JSON.stringify(value) : String(value),
      evidence: { presentation: 'expandable', label: '查看证据', format: (items) => items.map((item) => item.kind === 'system_derivation' ? item.rule : item.excerpt).join('；') },
      risk: { level: 'standard', label: '确认后修改已有记录' },
    }
  })
}
export const ITINERARY_SEGMENT_UPDATE_REVIEW_SCHEMA: ReviewSchema = {
  schemaId: 'departure.itinerary_segment_update', version: 1,
  payloadSchema: ITINERARY_SEGMENT_UPDATE_REVIEW_PAYLOAD_SCHEMA, targetKind: DEPARTURE_OBJECT_TARGET_KIND,
  confirmationUnits: [{ key: ITINERARY_SEGMENT_UPDATE_CONFIRMATION_UNIT, label: '行程段修改审核', targetLabel: '已有行程段',
    fields: reviewFields(itinerarySegmentUpdateReviewCandidateSchema, {
      itinerarySegmentId: '行程段', name: '名称', destination: '目的地', startDate: '开始日期', endDate: '结束日期', notes: '备注',
      fullTicketCount: '全票人数', halfTicketCount: '半票人数', studentTicketCount: '学生票人数', freeTicketCount: '免票人数',
    }) }],
  parseCandidate: (candidate) => itinerarySegmentUpdateReviewCandidateSchema.parse(storedCandidateSchema.parse(candidate)),
}
export const SOURCE_ORDER_GUESTS_UPDATE_REVIEW_SCHEMA: ReviewSchema = {
  schemaId: 'source_order.guests_update', version: 1,
  payloadSchema: SOURCE_ORDER_GUESTS_UPDATE_REVIEW_PAYLOAD_SCHEMA, targetKind: DEPARTURE_OBJECT_TARGET_KIND,
  confirmationUnits: [{ key: SOURCE_ORDER_GUESTS_UPDATE_CONFIRMATION_UNIT, label: '游客名单修改审核', targetLabel: '已有客源游客名单',
    fields: reviewFields(sourceOrderGuestsUpdateReviewCandidateSchema, { sourceOrderId: '客源单', guestChanges: '名单变更' }) }],
  parseCandidate: (candidate) => sourceOrderGuestsUpdateReviewCandidateSchema.parse(storedCandidateSchema.parse(candidate)),
}
const modelBase = {
  objectVersion: z.number().int().positive(),
  reviewPackageId: z.string().min(1).optional(),
  expectedPackageVersion: z.number().int().positive().optional(),
}
const segmentShape = {
  ...modelBase, confirmationUnit: z.literal(ITINERARY_SEGMENT_UPDATE_CONFIRMATION_UNIT),
  candidates: z.array(itinerarySegmentUpdateReviewCandidateSchema).min(2),
}
const guestsShape = {
  ...modelBase, confirmationUnit: z.literal(SOURCE_ORDER_GUESTS_UPDATE_CONFIRMATION_UNIT),
  candidates: z.array(sourceOrderGuestsUpdateReviewCandidateSchema).length(2),
}
function validateProposal(value: { reviewPackageId?: string; expectedPackageVersion?: number; confirmationUnit: string; candidates: { fieldKey: string }[] }, ctx: z.RefinementCtx) {
  if ((value.reviewPackageId == null) !== (value.expectedPackageVersion == null)) ctx.addIssue({ code: 'custom', message: '修订必须同时提供审核包 ID 和版本', path: ['reviewPackageId'] })
  const keys = value.candidates.map((candidate) => candidate.fieldKey)
  const target = value.confirmationUnit === ITINERARY_SEGMENT_UPDATE_CONFIRMATION_UNIT ? 'itinerarySegmentId' : 'sourceOrderId'
  if (!keys.includes(target)) ctx.addIssue({ code: 'custom', message: '必须指定已有目标 ID', path: ['candidates'] })
  if (new Set(keys).size !== keys.length) ctx.addIssue({ code: 'custom', message: '同一字段最多一条候选', path: ['candidates'] })
}
export const submitDepartureEditReviewModelInputSchema = z.discriminatedUnion('confirmationUnit', [
  z.object(segmentShape).strict(), z.object(guestsShape).strict(),
]).superRefine(validateProposal)
export const submitDepartureEditReviewInputSchema = z.discriminatedUnion('confirmationUnit', [
  z.object({ ...segmentShape, taskId: z.string().min(1), runId: z.string().min(1) }).strict(),
  z.object({ ...guestsShape, taskId: z.string().min(1), runId: z.string().min(1) }).strict(),
]).superRefine(validateProposal)
export type SubmitDepartureEditReviewModelInput = z.infer<typeof submitDepartureEditReviewModelInputSchema>
export type SubmitDepartureEditReviewInput = z.infer<typeof submitDepartureEditReviewInputSchema>
