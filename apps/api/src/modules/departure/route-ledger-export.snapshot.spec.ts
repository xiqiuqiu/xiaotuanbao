import type { RouteLedgerResult } from '@xiaotuanbao/shared'
import { ResourceKind } from '@xiaotuanbao/shared'
import { buildRouteLedgerExportSnapshot } from './route-ledger-export.snapshot'

function emptyTotals() {
  return {
    orderCount: 0,
    guestCount: 0,
    grossReceivableCents: 0,
    netReceivableCents: 0,
    partnerCollectedCents: 0,
    guestCollectCents: 0,
  }
}

const ledger: RouteLedgerResult = {
  routeName: '南疆5日游',
  startDateFrom: null,
  startDateTo: null,
  dateBlocks: [
    {
      startDate: '2026-08-01',
      totals: emptyTotals(),
      outsource: { totalAmountCents: 0, items: [] },
      routes: [
        {
          routeName: '南疆5日游',
          totals: emptyTotals(),
          outsource: { totalAmountCents: 0, items: [] },
          departures: [
            {
              departureId: 'dep-1',
              departureNo: 'XTB26070010',
              departureName: '团A',
              startDate: '2026-08-01',
              totals: {
                orderCount: 1,
                guestCount: 2,
                grossReceivableCents: 160000,
                netReceivableCents: 160000,
                partnerCollectedCents: 160000,
                guestCollectCents: 0,
              },
              outsource: { totalAmountCents: 0, items: [] },
              sourceOrders: [
                {
                  id: 'so-1',
                  departureId: 'dep-1',
                  partnerId: 'p1',
                  partnerName: '同程',
                  displayName: '同程-1',
                  guestRepresentativeName: '张三',
                  guestRepresentativePhone: '138',
                  adultGuestCount: 2,
                  childGuestCount: 0,
                  guestCount: 2,
                  adultUnitPriceCents: 80000,
                  childUnitPriceCents: 0,
                  grossReceivableCents: 160000,
                  netReceivableCents: 160000,
                  partnerCollectedCents: 160000,
                  guestCollectCents: 0,
                  notes: null,
                },
              ],
            },
            {
              departureId: 'dep-empty',
              departureNo: 'XTB26070011',
              departureName: '空壳',
              startDate: '2026-08-01',
              totals: emptyTotals(),
              outsource: { totalAmountCents: 0, items: [] },
              sourceOrders: [],
            },
          ],
        },
      ],
    },
  ],
}

describe('buildRouteLedgerExportSnapshot', () => {
  it('maps each departure to a sheet and attaches arrangement resources only', () => {
    const snapshot = buildRouteLedgerExportSnapshot({
      ledger,
      resources: [
        {
          departureId: 'dep-1',
          segmentName: 'D1',
          resourceKind: ResourceKind.HOTEL,
          title: '喀什酒店',
          supplierName: '喀什宾馆',
          amountCents: 50000,
          notes: null,
          sortKey: '001:hotel',
        },
      ],
      routeName: '南疆5日游',
      exportedAt: '2026-07-31T08:00:00.000Z',
      exportedByName: '演示管理员',
    })

    expect(snapshot.filename).toContain('线路视图_南疆5日游_')
    expect(snapshot.sheets).toHaveLength(2)
    expect(snapshot.sheets[0].sheetName).toBe('0801_XTB26070010')
    expect(snapshot.sheets[0].sourceOrders).toHaveLength(1)
    expect(snapshot.sheets[0].sourceOrderTotals.netReceivableYuan).toBe('1600.00')
    expect(snapshot.sheets[0].resources).toEqual([
      expect.objectContaining({
        resourceKindLabel: '酒店',
        supplierName: '喀什宾馆',
        amountYuan: '500.00',
      }),
    ])
    expect(snapshot.sheets[1].sourceOrders).toEqual([])
    expect(snapshot.sheets[1].resources).toEqual([])
  })
})
