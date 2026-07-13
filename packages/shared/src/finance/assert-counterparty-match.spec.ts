import { assertCounterpartyMatch, CounterpartyMismatchError } from './assert-counterparty-match'

describe('assertCounterpartyMatch', () => {
  const schedule = {
    counterpartyType: 'partner',
    counterpartyId: 'cp-1',
    counterpartyName: '测试旅行社',
  }

  it('passes when counterparty id matches', () => {
    expect(() =>
      assertCounterpartyMatch(schedule, {
        counterpartyType: 'partner',
        counterpartyId: 'cp-1',
        counterpartyName: '其他名称',
      }),
    ).not.toThrow()
  })

  it('passes when both lack id and names match after trim', () => {
    expect(() =>
      assertCounterpartyMatch(
        { counterpartyType: 'guest', counterpartyId: null, counterpartyName: '  同名游客  ' },
        { counterpartyType: 'guest', counterpartyId: null, counterpartyName: '同名游客' },
      ),
    ).not.toThrow()
  })

  it('rejects mismatched counterparty type', () => {
    expect(() =>
      assertCounterpartyMatch(schedule, {
        counterpartyType: 'supplier',
        counterpartyId: 'cp-1',
        counterpartyName: '测试旅行社',
      }),
    ).toThrow(CounterpartyMismatchError)
  })

  it('rejects mismatched counterparty id', () => {
    expect(() =>
      assertCounterpartyMatch(schedule, {
        counterpartyType: 'partner',
        counterpartyId: 'cp-2',
        counterpartyName: '测试旅行社',
      }),
    ).toThrow(CounterpartyMismatchError)
  })

  it('rejects mismatched counterparty name when no id', () => {
    expect(() =>
      assertCounterpartyMatch(
        { counterpartyType: 'guest', counterpartyId: null, counterpartyName: 'A' },
        { counterpartyType: 'guest', counterpartyId: null, counterpartyName: 'B' },
      ),
    ).toThrow(CounterpartyMismatchError)
  })

  it('matches guest collection by source-order id even when names differ', () => {
    expect(() =>
      assertCounterpartyMatch(
        {
          counterpartyType: 'guest',
          counterpartyId: 'source-order-1',
          counterpartyName: '福建土楼专线地接 7月15日发客',
        },
        {
          counterpartyType: 'guest',
          counterpartyId: 'source-order-1',
          counterpartyName: 'Hngyu',
        },
      ),
    ).not.toThrow()
  })

  it('rejects when only one side has counterparty id', () => {
    expect(() =>
      assertCounterpartyMatch(
        {
          counterpartyType: 'guest',
          counterpartyId: 'source-order-1',
          counterpartyName: '福建土楼专线地接 7月15日发客',
        },
        {
          counterpartyType: 'guest',
          counterpartyId: null,
          counterpartyName: '福建土楼专线地接 7月15日发客',
        },
      ),
    ).toThrow(CounterpartyMismatchError)
  })
})
