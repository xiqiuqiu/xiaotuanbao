import { registeredReviewSchemas } from './review-schema'
import {
  SOURCE_ORDER_RECEIVABLE_REVIEW_SCHEMA,
  parseSourceOrderReceivableReviewCandidate,
  requiredPermissionKeyForReviewPayloadSchema,
  sourceOrderReceivableReviewCandidates,
} from './source-order-receivable-schema'

const evidence = [{ kind: 'system_derivation' as const, rule: '正式客源单当前收款约定' }]

const splitPaths = [
  {
    sourceType: 'source_order_guest_balance_collection',
    title: '尾款代收',
    amountCents: 4_100_000,
    counterpartyType: 'guest',
    counterpartyName: '华东旅行社客源',
  },
  {
    sourceType: 'source_order_customer_settlement',
    title: '客户补款',
    amountCents: 2_000_000,
    counterpartyType: 'partner',
    counterpartyName: '华东旅行社',
  },
]

describe('source order receivable review schema #451', () => {
  it('registers a versioned whole-source receivable package against an existing departure', () => {
    const schema = registeredReviewSchemas.requireByPayloadSchema('source_order.receivable@v1')

    expect(schema).toBe(SOURCE_ORDER_RECEIVABLE_REVIEW_SCHEMA)
    expect(schema).toMatchObject({
      schemaId: 'source_order.receivable',
      version: 1,
      targetKind: 'departure',
      confirmationUnits: [
        expect.objectContaining({
          key: 'source_order_receivable',
          label: '初始应收审核',
          targetLabel: '客源单适用约定应收',
        }),
      ],
    })
    expect(schema.confirmationUnits[0]?.fields.every((field) => field.editable === false)).toBe(true)
    expect(schema.confirmationUnits[0]?.fields.map((field) => field.key)).toEqual([
      'sourceOrderId',
      'displayName',
      'partnerName',
      'collectionMode',
      'netReceivableCents',
      'paths',
      'historyStatus',
      'historyMessage',
    ])
  })

  it('lists every applicable positive path instead of collapsing to one node', () => {
    const candidates = sourceOrderReceivableReviewCandidates({
      sourceOrderId: 'so-1',
      displayName: '华东旅行社客源',
      partnerName: '华东旅行社',
      collectionMode: 'split',
      netReceivableCents: 6_100_000,
      paths: splitPaths,
      classification: { status: 'ready', paths: splitPaths },
    })
    const paths = candidates.find((candidate) => candidate.fieldKey === 'paths')?.proposedValue

    expect(paths).toEqual(splitPaths)
    expect(
      parseSourceOrderReceivableReviewCandidate({
        fieldKey: 'paths',
        proposedValue: paths,
        clarity: 'clear',
        evidence,
      }).proposedValue,
    ).toEqual(paths)
  })

  it('authorizes initial receivable confirm with /departure instead of departure:write', () => {
    expect(requiredPermissionKeyForReviewPayloadSchema('source_order.receivable@v1')).toBe(
      '/departure',
    )
    expect(requiredPermissionKeyForReviewPayloadSchema('source_order.create@v1')).toBe(
      'departure:write',
    )
  })
})
