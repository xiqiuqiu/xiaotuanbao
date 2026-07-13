import { buildPaymentScheduleCounterpartyWhere } from './payment-schedule-list-filters'

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

  it('filters by counterparty name keyword contains', () => {
    expect(
      buildPaymentScheduleCounterpartyWhere({
        counterpartyKeyword: '  丝路  ',
      }),
    ).toEqual({
      counterpartyName: { contains: '丝路' },
    })
  })

  it('combines type filter with keyword', () => {
    expect(
      buildPaymentScheduleCounterpartyWhere({
        counterpartyType: 'supplier',
        counterpartyKeyword: '丝路',
      }),
    ).toEqual({
      AND: [
        { counterpartyType: 'supplier' },
        { counterpartyName: { contains: '丝路' } },
      ],
    })
  })
})
