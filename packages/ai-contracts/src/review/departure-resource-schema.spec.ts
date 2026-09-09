import {
  DEPARTURE_RESOURCE_CONFIRMATION_UNIT,
  DEPARTURE_RESOURCE_REVIEW_PAYLOAD_SCHEMA,
  DEPARTURE_RESOURCE_REVIEW_SCHEMA,
  resolveDepartureResourceReviewDraft,
} from './departure-resource-schema'
import { registeredReviewSchemas } from './review-schema'

const evidence = [
  { kind: 'user_message' as const, excerpt: '全程保险 1200 元，覆盖 4月2日至4月6日', sequence: 1 },
]

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

describe('发团级资源审核 Schema #450', () => {
  it('registers the versioned departure-resource package against an existing departure', () => {
    const schema = registeredReviewSchemas.requireByPayloadSchema(
      DEPARTURE_RESOURCE_REVIEW_PAYLOAD_SCHEMA,
    )

    expect(schema).toBe(DEPARTURE_RESOURCE_REVIEW_SCHEMA)
    expect(schema).toMatchObject({
      schemaId: 'departure.departure_resource',
      version: 1,
      payloadSchema: 'departure.departure_resource@v1',
      targetKind: 'departure',
      confirmationUnits: [
        expect.objectContaining({
          key: DEPARTURE_RESOURCE_CONFIRMATION_UNIT,
          targetLabel: '发团级资源',
          fields: expect.arrayContaining([
            expect.objectContaining({
              key: 'resourceKind',
              label: '资源种类',
              control: 'choice',
              options: expect.arrayContaining([
                { label: '酒店', value: 'hotel' },
                { label: '用车', value: 'transport' },
                { label: '拼出', value: 'outsource' },
                { label: '保险', value: 'insurance' },
                { label: '用餐', value: 'meal' },
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
      expect.arrayContaining(['itinerarySegmentId', 'quantity', 'unitPriceCents', 'capacity']),
    )
  })

  it('resolves a cross-day whole-fee draft as one departure-level resource with dates in notes', () => {
    const result = resolveDepartureResourceReviewDraft([
      candidate('resourceKind', 'insurance'),
      candidate('supplierId', 'sup-pingan'),
      candidate('title', '全程旅行保险'),
      candidate('amountCents', 120000),
      candidate('notes', '覆盖 4月2日至4月6日，不拆价'),
    ])

    expect(result).toEqual({
      status: 'ready',
      draft: {
        resourceKind: 'insurance',
        supplierId: 'sup-pingan',
        title: '全程旅行保险',
        amountCents: 120000,
        notes: '覆盖 4月2日至4月6日，不拆价',
      },
      warnings: [],
    })
  })

  it('keeps a multi-service whole quote as the chosen kind instead of forcing outsource', () => {
    const result = resolveDepartureResourceReviewDraft([
      candidate('resourceKind', 'hotel'),
      candidate('supplierId', 'sup-agency'),
      candidate('title', '川西接待整体报价'),
      candidate('amountCents', 880000),
      candidate('notes', '含住宿、接送、用餐，按材料归为酒店，不自动改拼出'),
    ])

    expect(result).toMatchObject({
      status: 'ready',
      draft: {
        resourceKind: 'hotel',
        notes: '含住宿、接送、用餐，按材料归为酒店，不自动改拼出',
      },
    })
  })

  it('keeps unknown amount incomplete instead of filling zero, and does not invent a free-service fee row', () => {
    expect(
      resolveDepartureResourceReviewDraft([
        candidate('resourceKind', 'guide'),
        candidate('supplierId', 'sup-guide'),
        candidate('title', '全程导游'),
      ]),
    ).toEqual({
      status: 'incomplete',
      missingFieldKeys: ['amountCents'],
      reason: '发团级资源审核稿仍有待补充字段',
    })
    expect(
      resolveDepartureResourceReviewDraft([
        candidate('resourceKind', 'guide'),
        candidate('supplierId', 'sup-guide'),
        candidate('title', '全程导游'),
        candidate('amountCents', 0),
      ]),
    ).toMatchObject({ status: 'invalid', fieldKey: 'amountCents' })
  })

  it('rejects blank title and kinds outside the create catalog', () => {
    expect(
      resolveDepartureResourceReviewDraft([
        candidate('resourceKind', 'insurance'),
        candidate('supplierId', 'sup-1'),
        candidate('title', '   '),
        candidate('amountCents', 100),
      ]),
    ).toMatchObject({ status: 'invalid', fieldKey: 'title' })
    expect(
      resolveDepartureResourceReviewDraft([
        candidate('resourceKind', 'scenic'),
        candidate('supplierId', 'sup-1'),
        candidate('title', '景区讲解'),
        candidate('amountCents', 100),
      ]),
    ).toMatchObject({ status: 'invalid', fieldKey: 'resourceKind' })
  })

  it('surfaces capacity conflict as a reminder and still allows a valid fee draft', () => {
    const result = resolveDepartureResourceReviewDraft([
      candidate('resourceKind', 'transport'),
      candidate('supplierId', 'sup-bus'),
      candidate('title', '全程用车'),
      candidate('amountCents', 450000),
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
    const result = resolveDepartureResourceReviewDraft(
      [
        candidate('resourceKind', 'hotel'),
        candidate('supplierId', 'sup-old'),
        candidate('title', '接待'),
        candidate('amountCents', 880000),
      ],
      { supplierId: 'sup-new', title: '全程接待', notes: '4月2日至4月4日' },
    )

    expect(result).toMatchObject({
      status: 'ready',
      draft: {
        supplierId: 'sup-new',
        title: '全程接待',
        amountCents: 880000,
        notes: '4月2日至4月4日',
      },
    })
  })

  it.each([null, { amount: 880000 }, ['880000']])(
    'does not fall back to the original amount for invalid corrected value %p',
    (amountCents) => {
      const result = resolveDepartureResourceReviewDraft(
        [
          candidate('resourceKind', 'insurance'),
          candidate('supplierId', 'sup-1'),
          candidate('title', '全程保险'),
          candidate('amountCents', 880000),
        ],
        { amountCents },
      )
      expect(result.status).not.toBe('ready')
    },
  )
})
