import {
  buildPaymentScheduleCounterpartyWhere,
  dedupePaymentScheduleCounterparties,
} from './payment-schedule-list-filters'

describe('buildPaymentScheduleCounterpartyWhere', () => {
  it('returns undefined when no counterparty filter is set', () => {
    expect(buildPaymentScheduleCounterpartyWhere({})).toBeUndefined()
  })

  it('filters by type alone', () => {
    expect(
      buildPaymentScheduleCounterpartyWhere({ counterpartyType: 'supplier' }),
    ).toEqual({ counterpartyType: 'supplier' })
  })

  it('filters by type and id when id is present', () => {
    expect(
      buildPaymentScheduleCounterpartyWhere({
        counterpartyType: 'partner',
        counterpartyId: 'partner-1',
        counterpartyName: '应被忽略的名称',
      }),
    ).toEqual({
      counterpartyType: 'partner',
      counterpartyId: 'partner-1',
    })
  })

  it('filters by type, null id, and exact name when id is absent', () => {
    expect(
      buildPaymentScheduleCounterpartyWhere({
        counterpartyType: 'guest',
        counterpartyName: '  手改客人  ',
      }),
    ).toEqual({
      counterpartyType: 'guest',
      counterpartyId: null,
      counterpartyName: '手改客人',
    })
  })
})

describe('dedupePaymentScheduleCounterparties', () => {
  it('dedupes by type+id and keeps type+name rows without id', () => {
    const result = dedupePaymentScheduleCounterparties([
      {
        counterpartyType: 'supplier',
        counterpartyId: 'sup-1',
        counterpartyName: '丝路旅汽',
      },
      {
        counterpartyType: 'supplier',
        counterpartyId: 'sup-1',
        counterpartyName: '新疆丝路旅汽',
      },
      {
        counterpartyType: 'guest',
        counterpartyId: null,
        counterpartyName: '手改客人',
      },
      {
        counterpartyType: 'guest',
        counterpartyId: null,
        counterpartyName: '手改客人',
      },
      {
        counterpartyType: 'partner',
        counterpartyId: 'p-1',
        counterpartyName: '巴州博湖旅行社',
      },
    ])

    expect(result).toEqual([
      {
        counterpartyType: 'partner',
        counterpartyId: 'p-1',
        counterpartyName: '巴州博湖旅行社',
      },
      {
        counterpartyType: 'guest',
        counterpartyId: null,
        counterpartyName: '手改客人',
      },
      {
        counterpartyType: 'supplier',
        counterpartyId: 'sup-1',
        counterpartyName: '丝路旅汽',
      },
    ])
  })
})
