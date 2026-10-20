import {
  ITINERARY_SEGMENT_UPDATE_REVIEW_SCHEMA,
  SOURCE_ORDER_GUESTS_UPDATE_REVIEW_SCHEMA,
  sourceOrderGuestChangesSchema,
  submitDepartureEditReviewModelInputSchema,
} from './departure-edit-schema'
import { registeredReviewSchemas } from './review-schema'

const evidence = [{ kind: 'user_message', sequence: 1, excerpt: '修改当天行程，追加游客' }]
const candidate = (fieldKey: string, proposedValue: unknown) => ({ fieldKey, proposedValue, clarity: 'clear', evidence })
const segment = {
  objectVersion: 1,
  confirmationUnit: 'itinerary_segment_update',
  candidates: [candidate('itinerarySegmentId', 'seg-1'), candidate('notes', null)],
}

describe('departure edit review contract', () => {
  it('registers both review types and keeps target references immutable', () => {
    for (const schema of [ITINERARY_SEGMENT_UPDATE_REVIEW_SCHEMA, SOURCE_ORDER_GUESTS_UPDATE_REVIEW_SCHEMA]) {
      expect(registeredReviewSchemas.requireByPayloadSchema(schema.payloadSchema)).toBe(schema)
      expect(schema.confirmationUnits[0]?.fields[0]?.editable).toBe(false)
    }
  })

  it('accepts a partial segment update including nullable clearing and zero counts', () => {
    expect(submitDepartureEditReviewModelInputSchema.parse(segment)).toEqual(segment)
    expect(submitDepartureEditReviewModelInputSchema.safeParse({ ...segment,
      candidates: [...segment.candidates, candidate('freeTicketCount', 0)],
    }).success).toBe(true)
  })

  it('reads persisted candidates with status and corrections while model input stays strict', () => {
    for (const [schema, value] of [
      [ITINERARY_SEGMENT_UPDATE_REVIEW_SCHEMA, candidate('notes', null)],
      [SOURCE_ORDER_GUESTS_UPDATE_REVIEW_SCHEMA, candidate('guestChanges', { add: [{ name: '新游客' }] })],
    ] as const) {
      expect(schema.parseCandidate({ ...value, status: 'pending', userCorrectedValue: null })).toEqual(value)
    }
    expect(submitDepartureEditReviewModelInputSchema.safeParse({ ...segment,
      candidates: segment.candidates.map((value) => ({ ...value, status: 'pending' })),
    }).success).toBe(false)
  })

  it.each([
    { ...segment, candidates: [segment.candidates[0]] },
    { ...segment, candidates: [segment.candidates[1]] },
    { ...segment, candidates: [...segment.candidates, segment.candidates[1]] },
    { ...segment, candidates: [...segment.candidates, candidate('price', 100)] },
    { ...segment, candidates: [...segment.candidates, candidate('fullTicketCount', -1)] },
    { ...segment, candidates: [segment.candidates[0], candidate('startDate', '2026-02-30')] },
    { ...segment, reviewPackageId: 'review-1' },
    { ...segment, unexpected: 'hidden write' },
    { ...segment, candidates: [{ ...segment.candidates[0], evidence: [] }, segment.candidates[1]] },
  ])('rejects invalid, ambiguous or unsupported updates %#', (input) => {
    expect(submitDepartureEditReviewModelInputSchema.safeParse(input).success).toBe(false)
  })

  it('accepts targeted guest additions and partial updates without financial fields', () => {
    const changes = { add: [{ name: '新游客' }], update: [{ guestId: 'guest-1', phone: null }] }
    expect(sourceOrderGuestChangesSchema.parse(changes)).toEqual(changes)
    expect(submitDepartureEditReviewModelInputSchema.safeParse({
      objectVersion: 2, confirmationUnit: 'source_order_guests_update',
      candidates: [candidate('sourceOrderId', 'source-1'), candidate('guestChanges', changes)],
    }).success).toBe(true)
  })

  it.each([
    {}, { add: [], update: [] }, { update: [{ guestId: 'guest-1' }] },
    { update: [{ guestId: 'guest-1', name: '甲' }, { guestId: 'guest-1', name: '乙' }] },
    { add: [{ name: '甲', included: false }] },
    { update: [{ guestId: 'guest-1', adultGuestCount: 3 }] },
    { delete: ['guest-1'] },
  ])('rejects empty, repeated or destructive guest changes %#', (input) => {
    expect(sourceOrderGuestChangesSchema.safeParse(input).success).toBe(false)
  })
})
