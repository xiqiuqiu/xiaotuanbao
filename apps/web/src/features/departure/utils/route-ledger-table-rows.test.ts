import { describe, expect, it } from 'vitest'
import { flattenRouteLedgerDeparture } from './route-ledger-table-rows'

const emptyTotals = {
  orderCount: 0,
  guestCount: 0,
  grossReceivableCents: 0,
  netReceivableCents: 0,
  partnerCollectedCents: 0,
  guestCollectCents: 0,
}

function order(id: string, departureId: string) {
  return {
    id,
    departureId,
    partnerId: 'p',
    partnerName: '社',
    displayName: '社',
    guestRepresentativeName: null,
    guestRepresentativePhone: null,
    adultGuestCount: 1,
    childGuestCount: 0,
    guestCount: 1,
    adultUnitPriceCents: 10000,
    childUnitPriceCents: 0,
    grossReceivableCents: 10000,
    netReceivableCents: 10000,
    partnerCollectedCents: 0,
    guestCollectCents: 10000,
    notes: null,
  }
}

describe('flattenRouteLedgerDeparture', () => {
  it('单发团内按客源顺序编序号', () => {
    const rows = flattenRouteLedgerDeparture({
      departureId: 'd1',
      departureNo: 'XTB1',
      departureName: '一团',
      startDate: '2026-07-26',
      totals: emptyTotals,
      outsource: { totalAmountCents: 0, items: [] },
      sourceOrders: [order('a', 'd1'), order('b', 'd1')],
    })
    expect(rows.map((r) => r.seq)).toEqual([1, 2])
    expect(rows.map((r) => r.id)).toEqual(['a', 'b'])
  })

  it('空客源返回空行（由表壳空态承接）', () => {
    const rows = flattenRouteLedgerDeparture({
      departureId: 'empty',
      departureNo: 'XTB0',
      departureName: '空团',
      startDate: '2026-07-26',
      totals: emptyTotals,
      outsource: { totalAmountCents: 0, items: [] },
      sourceOrders: [],
    })
    expect(rows).toHaveLength(0)
  })
})
