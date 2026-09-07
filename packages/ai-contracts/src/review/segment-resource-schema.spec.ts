import {
  SEGMENT_RESOURCE_CONFIRMATION_UNIT,
  SEGMENT_RESOURCE_REVIEW_PAYLOAD_SCHEMA,
  SEGMENT_RESOURCE_REVIEW_SCHEMA,
  resolveSegmentResourceReviewDraft,
} from './segment-resource-schema'
import { registeredReviewSchemas } from './review-schema'

const evidence = [{ kind: 'user_message' as const, excerpt: '4月2日住宿 8800 元 挂云上酒店', sequence: 1 }]

function candidate(
  fieldKey: string,
  proposedValue: string | number,
  extra?: { clarity?: 'clear' | 'needs_confirmation' | 'undetermined' },
) {
  return {
    fieldKey,
    proposedValue,
    clarity: extra?.clarity ?? 'clear',
    evidence,
  }
}

describe('行程段资源审核 Schema #449', () => {
  it('registers the versioned segment-resource package against an existing departure', () => {
    const schema = registeredReviewSchemas.requireByPayloadSchema(
      SEGMENT_RESOURCE_REVIEW_PAYLOAD_SCHEMA,
    )

    expect(schema).toBe(SEGMENT_RESOURCE_REVIEW_SCHEMA)
    expect(schema).toMatchObject({
      schemaId: 'departure.segment_resource',
      version: 1,
      payloadSchema: 'departure.segment_resource@v1',
      targetKind: 'departure',
      confirmationUnits: [
        expect.objectContaining({
          key: SEGMENT_RESOURCE_CONFIRMATION_UNIT,
          targetLabel: '行程段资源',
          fields: expect.arrayContaining([
            expect.objectContaining({ key: 'itinerarySegmentId', label: '行程段', control: 'reference' }),
            expect.objectContaining({
              key: 'resourceKind',
              label: '资源种类',
              control: 'choice',
              options: expect.arrayContaining([
                { label: '酒店', value: 'hotel' },
                { label: '用车', value: 'transport' },
                { label: '拼出', value: 'outsource' },
              ]),
            }),
            expect.objectContaining({ key: 'supplierId', label: '供应商', control: 'reference' }),
            expect.objectContaining({ key: 'title', label: '资源名称', control: 'text' }),
            expect.objectContaining({
              key: 'amountCents',
              label: '约定总价',
              control: 'integer',
              number: { min: 1, precision: 0 },
            }),
            expect.objectContaining({ key: 'notes', label: '备注', control: 'text' }),
            expect.objectContaining({
              key: 'capacityWarning',
              label: '执行冲突提醒',
              editable: false,
            }),
          ]),
        }),
      ],
    })
    expect(schema.confirmationUnits[0].fields.map((field) => field.key)).not.toEqual(
      expect.arrayContaining(['quantity', 'unitPriceCents', 'capacity']),
    )
  })

  it('resolves a complete material-backed draft without inventing segment ownership', () => {
    const result = resolveSegmentResourceReviewDraft([
      candidate('itinerarySegmentId', 'seg-apr-2'),
      candidate('resourceKind', 'hotel'),
      candidate('supplierId', 'sup-cloud-hotel'),
      candidate('title', '4月2日住宿'),
      candidate('amountCents', 880000),
      candidate('notes', '含早'),
    ])

    expect(result).toEqual({
      status: 'ready',
      draft: {
        itinerarySegmentId: 'seg-apr-2',
        resourceKind: 'hotel',
        supplierId: 'sup-cloud-hotel',
        title: '4月2日住宿',
        amountCents: 880000,
        notes: '含早',
      },
      warnings: [],
    })
  })

  it('keeps missing segment ownership as incomplete instead of defaulting a page date', () => {
    const result = resolveSegmentResourceReviewDraft([
      candidate('resourceKind', 'hotel'),
      candidate('supplierId', 'sup-cloud-hotel'),
      candidate('title', '住宿'),
      candidate('amountCents', 880000),
    ])

    expect(result).toEqual({
      status: 'incomplete',
      missingFieldKeys: ['itinerarySegmentId'],
      reason: '材料未确定对应行程段，请核实归属，不能凭当前页面日期默认挂靠',
    })
  })

  it('rejects unknown amount, blank title and kinds outside the create catalog', () => {
    expect(
      resolveSegmentResourceReviewDraft([
        candidate('itinerarySegmentId', 'seg-1'),
        candidate('resourceKind', 'hotel'),
        candidate('supplierId', 'sup-1'),
        candidate('title', '住宿'),
        candidate('amountCents', 0),
      ]),
    ).toMatchObject({ status: 'invalid', fieldKey: 'amountCents' })
    expect(
      resolveSegmentResourceReviewDraft([
        candidate('itinerarySegmentId', 'seg-1'),
        candidate('resourceKind', 'hotel'),
        candidate('supplierId', 'sup-1'),
        candidate('title', '   '),
        candidate('amountCents', 100),
      ]),
    ).toMatchObject({ status: 'invalid', fieldKey: 'title' })
    expect(
      resolveSegmentResourceReviewDraft([
        candidate('itinerarySegmentId', 'seg-1'),
        candidate('resourceKind', 'scenic'),
        candidate('supplierId', 'sup-1'),
        candidate('title', '门票'),
        candidate('amountCents', 100),
      ]),
    ).toMatchObject({ status: 'invalid', fieldKey: 'resourceKind' })
  })

  it('surfaces capacity conflict as a reminder and still allows a valid fee draft', () => {
    const result = resolveSegmentResourceReviewDraft([
      candidate('itinerarySegmentId', 'seg-1'),
      candidate('resourceKind', 'transport'),
      candidate('supplierId', 'sup-bus'),
      candidate('title', '4月2日用车'),
      candidate('amountCents', 120000),
      candidate('capacityWarning', '材料座位 32，团上游客 40，差额 8'),
    ])

    expect(result.status).toBe('ready')
    if (result.status !== 'ready') {
      throw new Error('expected ready draft')
    }
    expect(result.draft.notes).toBeNull()
    expect(result.warnings).toEqual([
      {
        fieldKey: 'capacityWarning',
        message: '材料座位 32，团上游客 40，差额 8',
      },
    ])
  })

  it('applies user corrections when resolving the confirmation snapshot', () => {
    const result = resolveSegmentResourceReviewDraft(
      [
        candidate('itinerarySegmentId', 'seg-1'),
        candidate('resourceKind', 'hotel'),
        candidate('supplierId', 'sup-old'),
        candidate('title', '住宿'),
        candidate('amountCents', 880000),
      ],
      { supplierId: 'sup-new', title: '4月2日住宿' },
    )

    expect(result).toMatchObject({
      status: 'ready',
      draft: {
        supplierId: 'sup-new',
        title: '4月2日住宿',
        amountCents: 880000,
      },
    })
  })
  it.each([null, { amount: 880000 }, ['880000']])(
    'does not fall back to the original amount for invalid corrected value %p',
    (amountCents) => {
      const result = resolveSegmentResourceReviewDraft([
        candidate('itinerarySegmentId', 'seg-1'),
        candidate('resourceKind', 'hotel'),
        candidate('supplierId', 'sup-1'),
        candidate('title', '住宿'),
        candidate('amountCents', 880000),
      ], { amountCents })
      expect(result.status).not.toBe('ready')
    },
  )

})
