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
        { counterpartyType: 'manual', counterpartyId: null, counterpartyName: '  手工往来  ' },
        { counterpartyType: 'manual', counterpartyId: null, counterpartyName: '手工往来' },
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
        { counterpartyType: 'manual', counterpartyId: null, counterpartyName: 'A' },
        { counterpartyType: 'manual', counterpartyId: null, counterpartyName: 'B' },
      ),
    ).toThrow(CounterpartyMismatchError)
  })
})
