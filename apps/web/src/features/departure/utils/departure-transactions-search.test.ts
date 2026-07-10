import { describe, expect, it } from 'vitest'
import { TransactionDirection } from '@xiaotuanbao/shared'
import { buildDepartureTransactionTabSearch } from './departure-transactions-search'

describe('buildDepartureTransactionTabSearch', () => {
  it('deep-links to the departure transactions tab with optional direction', () => {
    expect(buildDepartureTransactionTabSearch()).toEqual({
      tab: 'transactions',
    })

    expect(buildDepartureTransactionTabSearch(TransactionDirection.INFLOW)).toEqual({
      tab: 'transactions',
      direction: TransactionDirection.INFLOW,
    })
  })
})
