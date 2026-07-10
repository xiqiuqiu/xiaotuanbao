import { describe, expect, it } from 'vitest'
import { TransactionDirection } from '@xiaotuanbao/shared'
import {
  applyTransactionListDeepLink,
  resolveTransactionListDeepLinkSearch,
} from './transaction-list-deep-link'

describe('transaction-list-deep-link', () => {
  it('resolves departure filter with optional direction', () => {
    expect(
      resolveTransactionListDeepLinkSearch({
        departureId: 'dep-1',
        direction: TransactionDirection.OUTFLOW,
      }),
    ).toEqual({
      departureId: 'dep-1',
      direction: TransactionDirection.OUTFLOW,
    })
  })

  it('ignores unknown direction values', () => {
    expect(
      resolveTransactionListDeepLinkSearch({
        departureId: 'dep-1',
        direction: 'sideways',
      }),
    ).toEqual({ departureId: 'dep-1' })
  })

  it('applies deep link by clearing date range and locking departure filters', () => {
    expect(
      applyTransactionListDeepLink({
        departureId: 'dep-88',
        direction: TransactionDirection.OUTFLOW,
      }),
    ).toEqual({
      dateRange: null,
      direction: TransactionDirection.OUTFLOW,
      writeoffStatus: undefined,
      departureFilter: 'dep-88',
      partnerKeyword: '',
      transactionNo: '',
      statusFilter: 'normal',
      page: 1,
      pageSize: 10,
    })
  })

  it('returns null when departureId is missing', () => {
    expect(applyTransactionListDeepLink({ direction: 'outflow' })).toBeNull()
  })
})
