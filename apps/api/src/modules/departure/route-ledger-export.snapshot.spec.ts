import type { RouteLedgerResult } from '@xiaotuanbao/shared'
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
              departureId: 'dep-full',
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
              outsource: {
                totalAmountCents: 30000,
                items: [
                  {
                    id: 'out-1',
                    supplierName: '拼出伙伴',
                    title: '拼出说明',
                    amountCents: 30000,
                  },
                ],
              },
              costResources: [
                {
                  id: 'cost-1',
                  seq: 1,
                  segmentLabel: 'D1',
                  resourceKindLabel: '酒店',
                  title: '喀什酒店',
                  supplierName: '喀什宾馆',
                  amountCents: 50000,
                  notes: null,
                },
              ],
              sourceOrders: [
                {
                  id: 'so-1',
                  departureId: 'dep-full',
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
              costResources: [],
              sourceOrders: [],
            },
            {
              departureId: 'dep-cost-only',
              departureNo: 'XTB26070012',
              departureName: '仅成本',
              startDate: '2026-08-01',
              totals: emptyTotals(),
              outsource: { totalAmountCents: 0, items: [] },
              costResources: [
                {
                  id: 'cost-2',
                  seq: 1,
                  segmentLabel: '发团级',
                  resourceKindLabel: '车辆',
                  title: '大巴',
                  supplierName: '运输公司',
                  amountCents: 120000,
                  notes: '备注',
                },
              ],
              sourceOrders: [],
            },
            {
              departureId: 'dep-outsource-only',
              departureNo: 'XTB26070013',
              departureName: '仅拼出',
              startDate: '2026-08-01',
              totals: emptyTotals(),
              outsource: {
                totalAmountCents: 45000,
                items: [
                  {
                    id: 'out-2',
                    supplierName: '外协方',
                    title: '拼出一单',
                    amountCents: 45000,
                  },
                ],
              },
              costResources: [],
              sourceOrders: [],
            },
          ],
        },
      ],
    },
  ],
}

describe('buildRouteLedgerExportSnapshot', () => {
  it('maps each departure to a sheet from costResources and outsource read model', () => {
    const snapshot = buildRouteLedgerExportSnapshot({
      ledger,
      routeName: '南疆5日游',
      exportedAt: '2026-07-31T08:00:00.000Z',
      exportedByName: '演示管理员',
    })

    expect(snapshot.filename).toContain('线路视图_南疆5日游_')
    expect(snapshot.sheets).toHaveLength(4)

    const full = snapshot.sheets[0]
    expect(full.sheetName).toBe('0801_XTB26070010')
    expect(full.sourceOrders).toHaveLength(1)
    expect(full.sourceOrderTotals.netReceivableCents).toBe(160000)
    expect(full.costRows).toEqual([
      expect.objectContaining({
        segmentLabel: 'D1',
        resourceKindLabel: '酒店',
        supplierName: '喀什宾馆',
        amountCents: 50000,
      }),
    ])
    expect(full.outsourceRows).toEqual([
      expect.objectContaining({
        supplierName: '拼出伙伴',
        amountCents: 30000,
      }),
    ])
    expect(full.outsourceTotalAmountCents).toBe(30000)

    const empty = snapshot.sheets[1]
    expect(empty.sourceOrders).toEqual([])
    expect(empty.costRows).toEqual([])
    expect(empty.outsourceRows).toEqual([])

    const costOnly = snapshot.sheets[2]
    expect(costOnly.costRows).toHaveLength(1)
    expect(costOnly.costRows[0].resourceKindLabel).toBe('车辆')
    expect(costOnly.outsourceRows).toEqual([])

    const outsourceOnly = snapshot.sheets[3]
    expect(outsourceOnly.costRows).toEqual([])
    expect(outsourceOnly.outsourceRows).toHaveLength(1)
    expect(outsourceOnly.outsourceTotalAmountCents).toBe(45000)
  })

  it('preserves cost resource seq from read model', () => {
    const snapshot = buildRouteLedgerExportSnapshot({
      ledger,
      exportedAt: '2026-07-31T08:00:00.000Z',
      exportedByName: '演示管理员',
    })
    expect(snapshot.sheets[0].costRows[0].seq).toBe(1)
    expect(snapshot.sheets[0].costRows[0].resourceKindLabel).toBe('酒店')
  })
})
