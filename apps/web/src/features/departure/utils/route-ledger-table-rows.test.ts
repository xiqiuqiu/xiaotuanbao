import { describe, expect, it } from 'vitest'
import type { RouteLedgerDateBlock } from '@xiaotuanbao/shared'
import {
  flattenRouteLedgerDateBlock,
  flattenRouteLedgerDepartures,
} from './route-ledger-table-rows'

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

describe('flattenRouteLedgerDepartures', () => {
  it('同发团客源行对发团列设置连续 rowSpan', () => {
    const { rows, emptyDepartures } = flattenRouteLedgerDepartures([
      {
        departureId: 'd1',
        departureNo: 'XTB1',
        departureName: '一团',
        startDate: '2026-07-26',
        totals: emptyTotals,
        outsource: { totalAmountCents: 0, items: [] },
        sourceOrders: [order('a', 'd1'), order('b', 'd1')],
      },
      {
        departureId: 'd2',
        departureNo: 'XTB2',
        departureName: '二团',
        startDate: '2026-07-26',
        totals: emptyTotals,
        outsource: { totalAmountCents: 0, items: [] },
        sourceOrders: [order('c', 'd2')],
      },
    ])
    expect(emptyDepartures).toHaveLength(0)
    expect(rows.map((r) => r.departureRowSpan)).toEqual([2, 0, 1])
    expect(rows.map((r) => r.seq)).toEqual([1, 2, 3])
  })

  it('空客源发团不进表行', () => {
    const { rows, emptyDepartures } = flattenRouteLedgerDepartures([
      {
        departureId: 'empty',
        departureNo: 'XTB0',
        departureName: '空团',
        startDate: '2026-07-26',
        totals: emptyTotals,
        outsource: { totalAmountCents: 0, items: [] },
        sourceOrders: [],
      },
    ])
    expect(rows).toHaveLength(0)
    expect(emptyDepartures[0]?.departureNo).toBe('XTB0')
  })
})

describe('flattenRouteLedgerDateBlock', () => {
  it('跨路线段展平发团行', () => {
    const block: RouteLedgerDateBlock = {
      startDate: '2026-07-26',
      totals: emptyTotals,
      outsource: { totalAmountCents: 0, items: [] },
      routes: [
        {
          routeName: '线A',
          totals: emptyTotals,
          outsource: { totalAmountCents: 0, items: [] },
          departures: [
            {
              departureId: 'd1',
              departureNo: 'XTB1',
              departureName: '一团',
              startDate: '2026-07-26',
              totals: emptyTotals,
              outsource: { totalAmountCents: 0, items: [] },
              sourceOrders: [order('a', 'd1')],
            },
          ],
        },
        {
          routeName: '线B',
          totals: emptyTotals,
          outsource: { totalAmountCents: 0, items: [] },
          departures: [
            {
              departureId: 'd2',
              departureNo: 'XTB2',
              departureName: '二团',
              startDate: '2026-07-26',
              totals: emptyTotals,
              outsource: { totalAmountCents: 0, items: [] },
              sourceOrders: [order('b', 'd2')],
            },
          ],
        },
      ],
    }

    const { rows } = flattenRouteLedgerDateBlock(block)
    expect(rows.map((r) => r.departureNo)).toEqual(['XTB1', 'XTB2'])
  })
})
