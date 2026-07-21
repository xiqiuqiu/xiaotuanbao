import {
  accountGenerationGapsHref,
  buildPendingSettlementBaseWhere,
  isPendingSettlementWriteoff,
  pendingSettlementHref,
  pendingSettlementTransactionHref,
} from './pending-settlement'

describe('pending-settlement', () => {
  it('builds normal (non-voided) transaction base where', () => {
    expect(buildPendingSettlementBaseWhere('org-1')).toEqual({
      organizationId: 'org-1',
      voidedAt: null,
    })
  })

  it('treats none and partial writeoff as pending settlement, excludes done', () => {
    expect(isPendingSettlementWriteoff(10000, 0)).toBe(true)
    expect(isPendingSettlementWriteoff(10000, 4000)).toBe(true)
    expect(isPendingSettlementWriteoff(10000, 10000)).toBe(false)
    expect(isPendingSettlementWriteoff(10000, 12000)).toBe(false)
  })

  it('serializes stable drill-down hrefs', () => {
    expect(pendingSettlementHref()).toBe(
      '/finance/transactions?status=normal&pendingSettlement=1',
    )
    expect(pendingSettlementTransactionHref('TX/测 1')).toBe(
      '/finance/transactions?status=normal&transactionNo=TX%2F%E6%B5%8B%201',
    )
    expect(accountGenerationGapsHref()).toBe('/account-generation-gaps')
  })
})
