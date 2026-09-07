import {
  SOURCE_ORDER_CREATE_REVIEW_SCHEMA,
  SOURCE_ORDER_REVIEW_GROUP_LABELS,
  parseSourceOrderReviewCandidate,
  submitSourceOrderReviewPackageModelInputSchema,
} from './source-order-schema'
import { registeredReviewSchemas } from './review-schema'

const evidence = [{ kind: 'user_message' as const, sequence: 1, excerpt: '材料写了8大2小' }]

describe('source order review schema #446', () => {
  it('registers the versioned source-order package against an existing departure', () => {
    const schema = registeredReviewSchemas.requireByPayloadSchema('source_order.create@v1')

    expect(schema).toBe(SOURCE_ORDER_CREATE_REVIEW_SCHEMA)
    expect(schema).toMatchObject({
      schemaId: 'source_order.create',
      version: 1,
      targetKind: 'departure',
      confirmationUnits: [
        expect.objectContaining({
          key: 'source_order_create',
          label: '客源单审核',
          targetLabel: '客源单及选定名单',
        }),
      ],
    })
    expect(schema.confirmationUnits[0]?.fields.map((field) => field.group)).toEqual(
      expect.arrayContaining(['quote', 'adjustments', 'discount', 'collection', 'guests']),
    )
    expect(SOURCE_ORDER_REVIEW_GROUP_LABELS.quote).toBe('客户与报价')
  })

  it('keeps missing quote fields as null instead of coercing them to zero', () => {
    const parsed = parseSourceOrderReviewCandidate({
      fieldKey: 'childGuestCount',
      proposedValue: null,
      clarity: 'undetermined',
      evidence,
    })

    expect(parsed).toMatchObject({
      fieldKey: 'childGuestCount',
      proposedValue: null,
      clarity: 'undetermined',
    })
  })

  it('accepts nested adjustment and guest rows', () => {
    expect(
      parseSourceOrderReviewCandidate({
        fieldKey: 'fareAdjustments',
        proposedValue: [
          {
            kind: 'single_room_topup',
            direction: 'increase',
            amountCents: 60000,
          },
        ],
        clarity: 'clear',
        evidence,
      }).proposedValue,
    ).toEqual([
      { kind: 'single_room_topup', direction: 'increase', amountCents: 60000 },
    ])

    expect(
      parseSourceOrderReviewCandidate({
        fieldKey: 'guests',
        proposedValue: [{ name: '王强', phone: '13800000000', included: true }],
        clarity: 'clear',
        evidence,
      }).proposedValue,
    ).toEqual([{ name: '王强', phone: '13800000000', included: true }])
  })

  it('rejects a zero-amount adjustment candidate', () => {
    expect(() =>
      parseSourceOrderReviewCandidate({
        fieldKey: 'fareAdjustments',
        proposedValue: [
          { kind: 'single_room_topup', direction: 'increase', amountCents: 0 },
        ],
        clarity: 'clear',
        evidence,
      }),
    ).toThrow()
  })

  it('accepts a source-order submit payload without filling omitted discount as none', () => {
    const parsed = submitSourceOrderReviewPackageModelInputSchema.parse({
      objectVersion: 1,
      confirmationUnit: 'source_order_create',
      candidates: [
        {
          fieldKey: 'partnerId',
          proposedValue: 'partner-1',
          clarity: 'clear',
          evidence,
        },
        {
          fieldKey: 'discountType',
          proposedValue: null,
          clarity: 'undetermined',
          evidence,
        },
      ],
    })

    expect(parsed.candidates.find((item) => item.fieldKey === 'discountType')?.proposedValue).toBeNull()
  })
})
