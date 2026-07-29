import { describe, expect, it } from 'vitest'
import type { RouteLedgerDateBlock, RouteLedgerDepartureGroup } from '@xiaotuanbao/shared'
import {
  formatRouteLedgerChineseDate,
  formatRouteLedgerReportTitle,
  formatRouteLedgerReportTitlePrefix,
  listRouteLedgerReportStack,
} from './route-ledger-reports'

const emptyTotals = {
  orderCount: 0,
  guestCount: 0,
  grossReceivableCents: 0,
  netReceivableCents: 0,
  partnerCollectedCents: 0,
  guestCollectCents: 0,
}

function departure(
  partial: Pick<RouteLedgerDepartureGroup, 'departureId' | 'departureNo' | 'startDate'> &
    Partial<RouteLedgerDepartureGroup>,
): RouteLedgerDepartureGroup {
  return {
    departureName: partial.departureName ?? '',
    totals: partial.totals ?? emptyTotals,
    outsource: partial.outsource ?? { totalAmountCents: 0, items: [] },
    sourceOrders: partial.sourceOrders ?? [],
    departureId: partial.departureId,
    departureNo: partial.departureNo,
    startDate: partial.startDate,
  }
}

describe('formatRouteLedgerReportTitle', () => {
  it('表头为出团日中文日期 + 路线名日报表 · 团号', () => {
    expect(formatRouteLedgerChineseDate('2026-07-26')).toBe('2026年7月26日')
    expect(formatRouteLedgerReportTitlePrefix('2026-07-26', '乌镇西栅2日线')).toBe(
      '2026年7月26日乌镇西栅2日线日报表',
    )
    expect(formatRouteLedgerReportTitle('2026-07-26', '乌镇西栅2日线', 'XTB2026070003')).toBe(
      '2026年7月26日乌镇西栅2日线日报表 · XTB2026070003',
    )
  })
})

describe('listRouteLedgerReportStack', () => {
  it('按出团日→路线名→团号展开为一团一份，同日多团不合并；换日插入日期分隔', () => {
    const blocks: RouteLedgerDateBlock[] = [
      {
        startDate: '2026-07-15',
        totals: emptyTotals,
        outsource: { totalAmountCents: 0, items: [] },
        routes: [
          {
            routeName: '阿勒泰拼车',
            totals: emptyTotals,
            outsource: { totalAmountCents: 0, items: [] },
            departures: [
              departure({
                departureId: 'd-alt',
                departureNo: 'XTB099',
                startDate: '2026-07-15',
              }),
            ],
          },
          {
            routeName: '伊犁环线',
            totals: emptyTotals,
            outsource: { totalAmountCents: 0, items: [] },
            departures: [
              departure({
                departureId: 'd-a',
                departureNo: 'XTB001',
                startDate: '2026-07-15',
              }),
              departure({
                departureId: 'd-b',
                departureNo: 'XTB002',
                startDate: '2026-07-15',
                sourceOrders: [],
              }),
            ],
          },
        ],
      },
      {
        startDate: '2026-07-16',
        totals: emptyTotals,
        outsource: { totalAmountCents: 0, items: [] },
        routes: [
          {
            routeName: '伊犁环线',
            totals: emptyTotals,
            outsource: { totalAmountCents: 0, items: [] },
            departures: [
              departure({
                departureId: 'd-c',
                departureNo: 'XTB003',
                startDate: '2026-07-16',
              }),
            ],
          },
        ],
      },
    ]

    const stack = listRouteLedgerReportStack(blocks)
    expect(stack.map((item) => {
      if (item.type === 'date-separator') {
        return `sep:${item.startDate}`
      }
      return `report:${item.departure.departureNo}`
    })).toEqual([
      'report:XTB099',
      'report:XTB001',
      'report:XTB002',
      'sep:2026-07-16',
      'report:XTB003',
    ])
    expect(stack.filter((item) => item.type === 'report')).toHaveLength(4)
  })
})
