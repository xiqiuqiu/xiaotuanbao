import { describe, expect, it, vi } from 'vitest'
import {
  DEPARTURE_DETAIL_QUERY_KEYS,
  invalidateDepartureDetailQueries,
} from './invalidate-departure-detail-queries'

describe('invalidateDepartureDetailQueries', () => {
  it('invalidates every departure-detail tab query prefix', () => {
    const invalidateQueries = vi.fn()
    const queryClient = { invalidateQueries } as never

    invalidateDepartureDetailQueries(queryClient, 'dep-1')

    expect(invalidateQueries.mock.calls.map((call) => call[0].queryKey)).toEqual([
      ['departure', 'dep-1'],
      ['segments', 'dep-1'],
      ['source-orders', 'dep-1'],
      ['segment-resources'],
      ['departure-receivables'],
      ['departure-payables'],
      ['departure-transactions'],
      ['departure-verifications'],
      ['payment-schedule-detail'],
    ])
    expect(DEPARTURE_DETAIL_QUERY_KEYS).toHaveLength(9)
  })
})
