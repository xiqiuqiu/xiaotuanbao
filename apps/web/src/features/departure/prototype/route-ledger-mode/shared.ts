import { formatCents } from '../../catalog'

export type LedgerMode = 'income' | 'cost'

/** 一团日报分面：客源收入 / 执行成本 / 拼出往来。 */
export type LedgerViewMode = 'income' | 'cost' | 'outsource'

export type ProtoIncomeRow = {
  id: string
  seq: number
  partnerName: string
  guestName: string
  phone: string
  adultUnitPriceCents: number
  childUnitPriceCents: number
  adultGuestCount: number
  childGuestCount: number
  grossReceivableCents: number
  guestCollectCents: number
  partnerCollectedCents: number
  netReceivableCents: number
  notes: string | null
}

export type ProtoCostRow = {
  id: string
  seq: number
  segmentLabel: string
  resourceKindLabel: string
  title: string
  supplierName: string
  amountCents: number
  notes: string | null
}

export type ProtoOutsourceItem = {
  id: string
  seq: number
  supplierName: string
  title: string
  amountCents: number
  notes: string | null
}

export type ProtoDepartureReport = {
  departureId: string
  departureNo: string
  startDate: string
  routeName: string
  incomeRows: ProtoIncomeRow[]
  costRows: ProtoCostRow[]
  outsource: {
    totalAmountCents: number
    items: ProtoOutsourceItem[]
  }
}

export type ProtoFinanceSummary = {
  netReceivableCents: number
  costCents: number
  outsourceCents: number
  marginCents: number
}

export function summarizeDeparture(report: ProtoDepartureReport): ProtoFinanceSummary {
  const netReceivableCents = report.incomeRows.reduce(
    (sum, row) => sum + row.netReceivableCents,
    0,
  )
  const costCents = report.costRows.reduce((sum, row) => sum + row.amountCents, 0)
  const outsourceCents = report.outsource.totalAmountCents
  return {
    netReceivableCents,
    costCents,
    outsourceCents,
    marginCents: netReceivableCents - costCents - outsourceCents,
  }
}

export function formatReportTitlePrefix(startDate: string, routeName: string): string {
  const [year, month, day] = startDate.split('-')
  return `${year}年${Number(month)}月${Number(day)}日${routeName}日报表`
}

export function formatChineseDate(startDate: string): string {
  const [year, month, day] = startDate.split('-')
  return `${year}年${Number(month)}月${Number(day)}日`
}

/** 线路视图资源区列名：按日/全程归属，不再称「行程段」。 */
export const COST_SCOPE_COLUMN_LABEL = '归属日程'

export { formatCents }

export const MOCK_ROUTE_NAMES = ['A线：天吐喀伊', 'B线：伊犁环线'] as const

export type ProtoRouteLedgerFilter = {
  routeName?: string
  startDateFrom?: string
  startDateTo?: string
}

/** 与线上线路视图一致：按路线名称 + 出团日期区间筛选。 */
export function filterMockReports(
  reports: ProtoDepartureReport[],
  filter: ProtoRouteLedgerFilter,
): ProtoDepartureReport[] {
  return reports.filter((report) => {
    if (filter.routeName && report.routeName !== filter.routeName) {
      return false
    }
    if (filter.startDateFrom && report.startDate < filter.startDateFrom) {
      return false
    }
    if (filter.startDateTo && report.startDate > filter.startDateTo) {
      return false
    }
    return true
  })
}

export const MOCK_REPORTS: ProtoDepartureReport[] = [
  {
    departureId: 'dep-728',
    departureNo: 'XTB2026070011',
    startDate: '2026-07-28',
    routeName: 'A线：天吐喀伊',
    incomeRows: [
      {
        id: 'so-1',
        seq: 1,
        partnerName: '思达典雅',
        guestName: '阿里',
        phone: '-',
        adultUnitPriceCents: 200000,
        childUnitPriceCents: 100000,
        adultGuestCount: 2,
        childGuestCount: 0,
        grossReceivableCents: 400000,
        guestCollectCents: 600000,
        partnerCollectedCents: 0,
        netReceivableCents: 500000,
        notes: null,
      },
      {
        id: 'so-2',
        seq: 2,
        partnerName: '备用合作伙伴',
        guestName: '李四',
        phone: '-',
        adultUnitPriceCents: 200000,
        childUnitPriceCents: 100000,
        adultGuestCount: 5,
        childGuestCount: 1,
        grossReceivableCents: 1100000,
        guestCollectCents: 1080000,
        partnerCollectedCents: 0,
        netReceivableCents: 1000000,
        notes: '含 1 小',
      },
    ],
    costRows: [
      {
        id: 'res-1',
        seq: 1,
        segmentLabel: 'D1 乌鲁木齐',
        resourceKindLabel: '酒店',
        title: '全季酒店 4 间',
        supplierName: '全季酒店（天山区店）',
        amountCents: 320000,
        notes: '含早',
      },
      {
        id: 'res-2',
        seq: 2,
        segmentLabel: 'D2 吐鲁番',
        resourceKindLabel: '门票',
        title: '火焰山门票',
        supplierName: '吐鲁番景区',
        amountCents: 84000,
        notes: null,
      },
      {
        id: 'res-3',
        seq: 3,
        segmentLabel: '全程',
        resourceKindLabel: '用车',
        title: '39 座旅游大巴',
        supplierName: '新疆顺达车队',
        amountCents: 450000,
        notes: '含司机餐补',
      },
      {
        id: 'res-4',
        seq: 4,
        segmentLabel: '全程',
        resourceKindLabel: '导游',
        title: '中文导游 1 名',
        supplierName: '王导',
        amountCents: 120000,
        notes: null,
      },
    ],
    outsource: {
      totalAmountCents: 180000,
      items: [
        {
          id: 'os-1',
          seq: 1,
          supplierName: '伊犁拼出社',
          title: '伊犁段拼出',
          amountCents: 120000,
          notes: 'D3-D4',
        },
        {
          id: 'os-2',
          seq: 2,
          supplierName: '那拉提拼出社',
          title: '那拉提段拼出',
          amountCents: 60000,
          notes: null,
        },
      ],
    },
  },
  {
    departureId: 'dep-731',
    departureNo: 'XTB2026070010',
    startDate: '2026-07-31',
    routeName: 'A线：天吐喀伊',
    incomeRows: [
      {
        id: 'so-3',
        seq: 1,
        partnerName: '备用合作伙伴',
        guestName: '王五',
        phone: '13700003333',
        adultUnitPriceCents: 200000,
        childUnitPriceCents: 0,
        adultGuestCount: 3,
        childGuestCount: 0,
        grossReceivableCents: 600000,
        guestCollectCents: 0,
        partnerCollectedCents: 600000,
        netReceivableCents: 600000,
        notes: null,
      },
    ],
    costRows: [
      {
        id: 'res-5',
        seq: 1,
        segmentLabel: 'D1 乌鲁木齐',
        resourceKindLabel: '酒店',
        title: '如家 3 间',
        supplierName: '如家酒店',
        amountCents: 210000,
        notes: null,
      },
      {
        id: 'res-6',
        seq: 2,
        segmentLabel: 'D2 天池',
        resourceKindLabel: '门票',
        title: '天池区间车+门票',
        supplierName: '天池景区',
        amountCents: 96000,
        notes: '含区间车',
      },
      {
        id: 'res-7',
        seq: 3,
        segmentLabel: '全程',
        resourceKindLabel: '用车',
        title: '33 座旅游大巴',
        supplierName: '新疆顺达车队',
        amountCents: 380000,
        notes: null,
      },
    ],
    outsource: {
      totalAmountCents: 0,
      items: [],
    },
  },
  {
    departureId: 'dep-b729',
    departureNo: 'XTB2026070021',
    startDate: '2026-07-29',
    routeName: 'B线：伊犁环线',
    incomeRows: [
      {
        id: 'so-b1',
        seq: 1,
        partnerName: '华东国旅',
        guestName: '陈志明',
        phone: '13800002211',
        adultUnitPriceCents: 90000,
        childUnitPriceCents: 50000,
        adultGuestCount: 2,
        childGuestCount: 1,
        grossReceivableCents: 230000,
        guestCollectCents: 0,
        partnerCollectedCents: 230000,
        netReceivableCents: 230000,
        notes: null,
      },
    ],
    costRows: [
      {
        id: 'res-b1',
        seq: 1,
        segmentLabel: 'D1 伊宁',
        resourceKindLabel: '酒店',
        title: '伊宁宾馆 2 间',
        supplierName: '伊宁宾馆',
        amountCents: 160000,
        notes: null,
      },
    ],
    outsource: {
      totalAmountCents: 80000,
      items: [
        {
          id: 'os-b1',
          seq: 1,
          supplierName: '伊犁拼出社',
          title: '伊犁段拼出',
          amountCents: 80000,
          notes: null,
        },
      ],
    },
  },
]
