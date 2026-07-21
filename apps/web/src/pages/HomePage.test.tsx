import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getWorkbench } from '@/services/workbench.service'
import { useAuthStore } from '@/app/store/auth.store'
import { HomePage } from './HomePage'
import { workbenchQueryOptions } from './workbench-query'

const navigate = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
}))

vi.mock('@/services/workbench.service', () => ({
  getWorkbench: vi.fn(),
}))

vi.mock('@ant-design/plots', () => ({
  DualAxes: () => <div data-testid="workbench-trend-chart" />,
  Column: () => <div data-testid="workbench-aging-column" />,
}))

const coordinatorSnapshot = {
  template: 'coordinator' as const,
  organization: { id: 'org-1', name: '测试旅行社' },
  asOf: '2026-07-21T02:03:04.000Z',
  modules: [
    {
      key: 'coordinator-departures' as const,
      title: '近期发团',
      metrics: [
        { key: 'zero', label: '真实零值', value: 0 },
        { key: 'missing', label: '缺失值', value: null },
      ],
      items: [],
    },
  ],
  actions: [
    {
      key: 'create-departure' as const,
      label: '新建发团',
      href: '/departure/new' as const,
      requiredPermission: 'departure:write' as const,
      emphasis: 'primary' as const,
    },
  ],
}

const coordinatorDeliverySnapshot = {
  ...coordinatorSnapshot,
  modules: [
    {
      key: 'coordinator-departures' as const,
      title: '近期发团',
      total: 9,
      href: '/departure?operationalWindow=current_and_next_7_days',
      metrics: [
        {
          key: 'in-progress',
          label: '进行中发团',
          value: 2,
          suffix: '个发团',
          href: '/departure?operationalWindow=in_progress',
        },
        {
          key: 'next-7-days',
          label: '未来 7 天发团',
          value: 6,
          suffix: '个发团',
          href: '/departure?operationalWindow=next_7_days',
        },
        {
          key: 'data-gaps',
          label: '资料待补充',
          value: 4,
          suffix: '个发团',
          href: '/departure?operationalWindow=current_and_next_7_days&departureDataGap=any',
        },
        {
          key: 'settlement-ready',
          label: '可确认结清',
          value: 6,
          suffix: '个发团',
          href: '/departure?settlementReadiness=ready',
        },
      ],
      items: [
        {
          kind: 'coordinator-departure' as const,
          id: 'departure-1',
          title: '云南昆明 6 日游',
          href: '/departure/departure-1',
          ownerName: '周计调',
          startDate: '2026-07-21',
          endDate: '2026-07-26',
          timeHint: '今日出发',
          status: 'editing',
          pendingReceivableCount: 2,
          dataGaps: [
            { code: 'no_source_orders' as const, label: '无客源单' },
            { code: 'no_itinerary_segments' as const, label: '无行程段' },
            { code: 'no_segment_resources' as const, label: '无行程资源' },
          ],
        },
        {
          kind: 'coordinator-departure' as const,
          id: 'departure-2',
          title: '海南三亚 5 日游',
          href: '/departure/departure-2',
          ownerName: '李敏',
          startDate: '2026-07-20',
          endDate: '2026-07-22',
          timeHint: '进行中',
          status: 'pending_settlement',
          dataGaps: [],
        },
        {
          kind: 'coordinator-departure' as const,
          id: 'departure-3',
          title: '桂林研学团',
          href: '/departure/departure-3',
          ownerName: '王磊',
          startDate: '2026-07-22',
          endDate: '2026-07-25',
          timeHint: '1 天后出发',
          status: 'settled',
          dataGaps: [],
        },
      ],
    },
    {
      key: 'coordinator-settlement' as const,
      title: '结算衔接',
      metrics: [
        {
          key: 'pending-receivables',
          label: '待生成应收',
          value: 7,
          suffix: '个客源单',
          href: '/source-orders?receivableGeneration=not_generated',
        },
      ],
      items: [
        ...Array.from({ length: 6 }, (_, index) => ({
          kind: 'coordinator-settlement-ready' as const,
          id: `settlement-${index + 1}`,
          title: `可结清发团 ${index + 1}`,
          href: `/departure/settlement-${index + 1}`,
          endDate: `2026-07-${String(index + 10).padStart(2, '0')}`,
        })),
        ...Array.from({ length: 7 }, (_, index) => ({
          kind: 'coordinator-receivable-pending' as const,
          id: `source-order-${index + 1}`,
          title: `待生成客源单 ${index + 1}`,
          href: `/departure/departure-${index + 1}?tab=sourceOrders`,
          departureName: `关联发团 ${index + 1}`,
        })),
      ],
    },
    {
      key: 'coordinator-trend' as const,
      title: '未来团量与客流',
      metrics: [],
      items: [],
      buckets: [
        {
          date: '2026-07-22',
          departureCount: 2,
          guestCount: 15,
          dataGapDepartureCount: 1,
          href: '/departure?startDateFrom=2026-07-22&startDateTo=2026-07-22&excludeClosed=1',
        },
        {
          date: '2026-07-23',
          departureCount: 0,
          guestCount: 0,
          dataGapDepartureCount: 0,
          href: '/departure?startDateFrom=2026-07-23&startDateTo=2026-07-23&excludeClosed=1',
        },
      ],
    },
  ],
}

const coordinatorTrendEmptySnapshot = {
  ...coordinatorDeliverySnapshot,
  modules: coordinatorDeliverySnapshot.modules.map((module) =>
    module.key === 'coordinator-trend'
      ? {
          ...module,
          buckets: [
            {
              date: '2026-07-22',
              departureCount: 0,
              guestCount: 0,
              dataGapDepartureCount: 0,
              href: '/departure?startDateFrom=2026-07-22&startDateTo=2026-07-22&excludeClosed=1',
            },
          ],
        }
      : module,
  ),
}

const organizationAdminSnapshot = {
  template: 'organization_admin' as const,
  organization: { id: 'org-admin-1', name: '管理旅行社' },
  asOf: '2026-07-21T02:03:04.000Z',
  modules: [
    {
      key: 'organization-scale' as const,
      title: '业务规模与趋势',
      metrics: [
        {
          key: 'month-departures',
          label: '本月发团数',
          value: 2,
          suffix: '个发团',
          href: '/departure?startDateFrom=2026-07-01&startDateTo=2026-07-31',
        },
        {
          key: 'month-guests',
          label: '本月客源人次',
          value: 12,
          suffix: '人次',
          href: '/departure?startDateFrom=2026-07-01&startDateTo=2026-07-31',
        },
      ],
      items: [],
      buckets: [
        {
          month: '2026-06',
          monthStart: '2026-06-01',
          monthEnd: '2026-06-30',
          departureCount: 1,
          guestCount: 4,
          inProgress: false,
          href: '/departure?startDateFrom=2026-06-01&startDateTo=2026-06-30',
        },
        {
          month: '2026-07',
          monthStart: '2026-07-01',
          monthEnd: '2026-07-31',
          departureCount: 2,
          guestCount: 12,
          inProgress: true,
          href: '/departure?startDateFrom=2026-07-01&startDateTo=2026-07-31',
        },
      ],
    },
    {
      key: 'organization-risk' as const,
      title: '经营风险摘要',
      total: 6,
      metrics: [
        {
          key: 'overdue-receivables',
          label: '逾期应收',
          value: 125000,
          secondaryValue: 3,
          secondarySuffix: '个节点',
          href: '/finance/receivable?receivableFollowUp=overdue',
        },
        {
          key: 'pending-settlement',
          label: '待核销资金',
          value: 46800,
          secondaryValue: 11,
          secondarySuffix: '笔（收入 8 · 支出 3）',
          href: '/finance/transactions?status=normal&pendingSettlement=1',
        },
        {
          key: 'high-risk',
          label: '高风险',
          value: 2,
          suffix: '项',
        },
        {
          key: 'attention',
          label: '需关注',
          value: 4,
          suffix: '项',
        },
        {
          key: 'risk-receivable-over-30',
          label: '逾期应收超过 30 天',
          value: 1,
          suffix: '项',
          href: '/finance/receivable?receivableFollowUp=aging_over_30',
        },
        {
          key: 'risk-settlement-stale',
          label: '流水超过 7 天未核销',
          value: 1,
          suffix: '项',
          href: '/finance/transactions?status=normal&pendingSettlement=1&dateEnd=2026-07-13',
        },
      ],
      items: [
        {
          kind: 'organization-risk' as const,
          id: 'receivable_overdue_over_30:1',
          title: '逾期大额应收',
          description: 'AR-0001',
          href: '/finance/receivable?scheduleNo=AR-0001',
          code: 'receivable_overdue_over_30' as const,
          severity: 'high' as const,
          reason: '应收逾期超过 30 天',
          amountCents: 90000,
          overdueDays: 46,
        },
        {
          kind: 'organization-risk' as const,
          id: 'departure_data_gap_imminent:1',
          title: '西藏林芝小团',
          description: '无行程资源',
          href: '/departure/dep-risk-1',
          code: 'departure_data_gap_imminent' as const,
          severity: 'high' as const,
          reason: '明天出发且资料待补充',
          daysUntilStart: 1,
        },
        {
          kind: 'organization-risk' as const,
          id: 'receivable_overdue_8_30:1',
          title: '中度逾期应收',
          description: 'AR-0002',
          href: '/finance/receivable?scheduleNo=AR-0002',
          code: 'receivable_overdue_8_30' as const,
          severity: 'attention' as const,
          reason: '应收逾期 8–30 天',
          amountCents: 24000,
          overdueDays: 12,
        },
        {
          kind: 'organization-risk' as const,
          id: 'settlement_stale_over_7:1',
          title: '阳光学校',
          description: 'TX-0001',
          href: '/finance/transactions?status=normal&transactionNo=TX-0001',
          code: 'settlement_stale_over_7' as const,
          severity: 'attention' as const,
          reason: '流水超过 7 天仍未完全核销',
          amountCents: 12600,
          unsettledDays: 63,
        },
        {
          kind: 'organization-risk' as const,
          id: 'ended_departure_account_gap:1',
          title: '海南三亚五日游',
          description: 'FT-0001',
          href: '/departure/dep-risk-2',
          code: 'ended_departure_account_gap' as const,
          severity: 'attention' as const,
          reason: '已结束发团仍有应收或应付尚未生成',
          amountCents: 18000,
        },
      ],
    },
  ],
  actions: [
    {
      key: 'create-departure' as const,
      label: '新建发团',
      href: '/departure/new' as const,
      requiredPermission: 'departure:write' as const,
      emphasis: 'secondary' as const,
    },
  ],
}

const organizationAdminEmptySnapshot = {
  ...organizationAdminSnapshot,
  modules: organizationAdminSnapshot.modules.map((module) => {
    if (module.key === 'organization-scale') {
      return {
        ...module,
        metrics: [
          {
            key: 'month-departures',
            label: '本月发团数',
            value: 0,
            suffix: '个发团',
            href: '/departure?startDateFrom=2026-07-01&startDateTo=2026-07-31',
          },
          {
            key: 'month-guests',
            label: '本月客源人次',
            value: 0,
            suffix: '人次',
            href: '/departure?startDateFrom=2026-07-01&startDateTo=2026-07-31',
          },
        ],
        buckets: [
          {
            month: '2026-07',
            monthStart: '2026-07-01',
            monthEnd: '2026-07-31',
            departureCount: 0,
            guestCount: 0,
            inProgress: true,
            href: '/departure?startDateFrom=2026-07-01&startDateTo=2026-07-31',
          },
        ],
      }
    }
    if (module.key === 'organization-risk') {
      return {
        ...module,
        total: 0,
        metrics: [
          {
            key: 'overdue-receivables',
            label: '逾期应收',
            value: 0,
            secondaryValue: 0,
            secondarySuffix: '个节点',
            href: '/finance/receivable?receivableFollowUp=overdue',
          },
          {
            key: 'pending-settlement',
            label: '待核销资金',
            value: 0,
            secondaryValue: 0,
            secondarySuffix: '笔（收入 0 · 支出 0）',
            href: '/finance/transactions?status=normal&pendingSettlement=1',
          },
          {
            key: 'high-risk',
            label: '高风险',
            value: 0,
            suffix: '项',
          },
          {
            key: 'attention',
            label: '需关注',
            value: 0,
            suffix: '项',
          },
        ],
        items: [],
      }
    }
    return module
  }),
}

const organizationAdminNoRiskSnapshot = {
  ...organizationAdminSnapshot,
  modules: organizationAdminSnapshot.modules.map((module) =>
    module.key === 'organization-risk'
      ? {
          ...module,
          total: 0,
          metrics: [
            {
              key: 'overdue-receivables',
              label: '逾期应收',
              value: 0,
              secondaryValue: 0,
              secondarySuffix: '个节点',
              href: '/finance/receivable?receivableFollowUp=overdue',
            },
            {
              key: 'pending-settlement',
              label: '待核销资金',
              value: 0,
              secondaryValue: 0,
              secondarySuffix: '笔（收入 0 · 支出 0）',
              href: '/finance/transactions?status=normal&pendingSettlement=1',
            },
            {
              key: 'high-risk',
              label: '高风险',
              value: 0,
              suffix: '项',
            },
            {
              key: 'attention',
              label: '需关注',
              value: 0,
              suffix: '项',
            },
          ],
          items: [],
        }
      : module,
  ),
}

const financeReceivablesSnapshot = {
  template: 'finance' as const,
  organization: { id: 'org-finance-1', name: '财务旅行社' },
  asOf: '2026-07-21T02:03:04.000Z',
  modules: [
    {
      key: 'finance-receivables' as const,
      title: '应收跟进',
      total: 9,
      href: '/finance/receivable?receivableFollowUp=follow_up',
      metrics: [
        {
          key: 'overdue-receivables',
          label: '逾期应收',
          value: 125000,
          secondaryValue: 3,
          secondarySuffix: '个节点',
          href: '/finance/receivable?receivableFollowUp=overdue',
        },
        {
          key: 'due-within-7-days',
          label: '未来 7 天到期应收',
          value: 80000,
          secondaryValue: 2,
          secondarySuffix: '个节点',
          href: '/finance/receivable?receivableFollowUp=due_within_7_days',
        },
      ],
      items: [
        {
          kind: 'finance-receivable' as const,
          id: 'ar-1',
          title: '逾期大额应收',
          description: 'AR-0001',
          href: '/finance/receivable?scheduleNo=AR-0001',
          dueDate: '2026-06-20',
          unsettledAmountCents: 90000,
          overdueDays: 31,
          departureClosed: true,
          counterpartyName: '丝路旅行社',
        },
        ...Array.from({ length: 6 }, (_, index) => ({
          kind: 'finance-receivable' as const,
          id: `ar-extra-${index + 1}`,
          title: `跟进项 ${index + 1}`,
          description: `AR-EXTRA-${index + 1}`,
          href: `/finance/receivable?scheduleNo=AR-EXTRA-${index + 1}`,
          dueDate: '2026-07-10',
          unsettledAmountCents: 1000 * (index + 1),
          overdueDays: 11 - index,
          departureClosed: false,
          counterpartyName: '测试同行',
        })),
        {
          kind: 'finance-receivable' as const,
          id: 'ar-2',
          title: '近期到期应收',
          description: 'AR-0002',
          href: '/finance/receivable?scheduleNo=AR-0002',
          dueDate: '2026-07-22',
          unsettledAmountCents: 40000,
          overdueDays: null,
          departureClosed: false,
          counterpartyName: '云端同行',
        },
      ],
      buckets: [
        {
          key: 'aging_1_7' as const,
          label: '1–7 天',
          scheduleCount: 1,
          unsettledAmountCents: 10000,
          href: '/finance/receivable?receivableFollowUp=aging_1_7',
        },
        {
          key: 'aging_8_30' as const,
          label: '8–30 天',
          scheduleCount: 1,
          unsettledAmountCents: 25000,
          href: '/finance/receivable?receivableFollowUp=aging_8_30',
        },
        {
          key: 'aging_over_30' as const,
          label: '30 天以上',
          scheduleCount: 1,
          unsettledAmountCents: 90000,
          href: '/finance/receivable?receivableFollowUp=aging_over_30',
        },
      ],
    },
    {
      key: 'finance-funds' as const,
      title: '资金与账款',
      total: 3,
      href: '/finance/transactions?status=normal&pendingSettlement=1',
      secondaryTotal: 2,
      secondaryHref: '/departure/account-generation-gaps',
      metrics: [
        {
          key: 'pending-payment',
          label: '待付款',
          value: 21540000,
          secondaryValue: 18,
          secondarySuffix: '个节点',
          href: '/finance/payable?payableBalance=open_unpaid',
        },
        {
          key: 'pending-settlement',
          label: '待核销流水',
          value: 4680000,
          secondaryValue: 11,
          secondarySuffix: '笔（收入 8 · 支出 3）',
          href: '/finance/transactions?status=normal&pendingSettlement=1',
        },
      ],
      items: [
        {
          kind: 'finance-pending-settlement' as const,
          id: 'tx-1',
          title: '阳光学校',
          description: 'TX-0001',
          href: '/finance/transactions?status=normal&transactionNo=TX-0001',
          direction: 'inflow' as const,
          transactionDate: '2025-07-19',
          unallocatedAmountCents: 1260000,
          counterpartyName: '阳光学校',
          departureClosed: true,
        },
        {
          kind: 'finance-pending-settlement' as const,
          id: 'tx-2',
          title: '云端车队',
          description: 'TX-0002',
          href: '/finance/transactions?status=normal&transactionNo=TX-0002',
          direction: 'outflow' as const,
          transactionDate: '2025-07-18',
          unallocatedAmountCents: 800000,
          counterpartyName: '云端车队',
          departureClosed: false,
        },
        {
          kind: 'finance-account-generation' as const,
          id: 'receivable:so-1',
          title: '云南昆明六日游客源单',
          description: '滇西线发团',
          href: '/departure/dep-1?tab=sourceOrders',
          generationKind: 'receivable' as const,
          estimatedAmountCents: 1890000,
          departureClosed: false,
        },
        {
          kind: 'finance-account-generation' as const,
          id: 'payable:res-1',
          title: '酒店资源',
          description: '滇西线发团',
          href: '/departure/dep-1?tab=execution&highlightSegmentResourceId=res-1',
          generationKind: 'payable' as const,
          estimatedAmountCents: 560000,
          departureClosed: true,
        },
      ],
    },
  ],
  actions: [],
}

const financeReceivablesEmptySnapshot = {
  ...financeReceivablesSnapshot,
  modules: financeReceivablesSnapshot.modules.map((module) =>
    module.key === 'finance-receivables'
      ? {
          ...module,
          total: 0,
          metrics: [
            {
              key: 'overdue-receivables',
              label: '逾期应收',
              value: 0,
              secondaryValue: 0,
              secondarySuffix: '个节点',
              href: '/finance/receivable?receivableFollowUp=overdue',
            },
            {
              key: 'due-within-7-days',
              label: '未来 7 天到期应收',
              value: 0,
              secondaryValue: 0,
              secondarySuffix: '个节点',
              href: '/finance/receivable?receivableFollowUp=due_within_7_days',
            },
          ],
          items: [],
          buckets: [
            {
              key: 'aging_1_7' as const,
              label: '1–7 天',
              scheduleCount: 0,
              unsettledAmountCents: 0,
              href: '/finance/receivable?receivableFollowUp=aging_1_7',
            },
            {
              key: 'aging_8_30' as const,
              label: '8–30 天',
              scheduleCount: 0,
              unsettledAmountCents: 0,
              href: '/finance/receivable?receivableFollowUp=aging_8_30',
            },
            {
              key: 'aging_over_30' as const,
              label: '30 天以上',
              scheduleCount: 0,
              unsettledAmountCents: 0,
              href: '/finance/receivable?receivableFollowUp=aging_over_30',
            },
          ],
        }
      : module,
  ),
}

function renderPage() {
  return renderPageWithClient(new QueryClient({
    defaultOptions: { queries: { retry: false } },
  }))
}

function renderPageWithClient(queryClient: QueryClient) {
  return render(
    <QueryClientProvider client={queryClient}>
      <HomePage />
    </QueryClientProvider>,
  )
}

describe('HomePage workbench lifecycle', () => {
  beforeEach(() => {
    navigate.mockReset()
    vi.mocked(getWorkbench).mockReset()
    useAuthStore.setState({ actionKeys: ['departure:write'] })
  })

  afterEach(cleanup)

  it('refetches on mount and window focus without polling', () => {
    expect(workbenchQueryOptions).toMatchObject({
      staleTime: 0,
      refetchOnMount: 'always',
      refetchOnWindowFocus: 'always',
    })
    expect(workbenchQueryOptions).not.toHaveProperty('refetchInterval')
  })

  it('refetches when returning from a drill-down page while keeping the cached snapshot', async () => {
    vi.mocked(getWorkbench).mockResolvedValue(coordinatorSnapshot)
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const firstVisit = renderPageWithClient(queryClient)
    expect(await screen.findByText('测试旅行社')).toBeInTheDocument()

    firstVisit.unmount()
    renderPageWithClient(queryClient)

    expect(screen.getByText('测试旅行社')).toBeInTheDocument()
    await waitFor(() => expect(getWorkbench).toHaveBeenCalledTimes(2))
  })

  it('distinguishes initial loading, zero, missing value and empty module data', async () => {
    let resolveRequest!: (value: typeof coordinatorSnapshot) => void
    vi.mocked(getWorkbench).mockImplementation(
      () => new Promise((resolve) => { resolveRequest = resolve }),
    )

    renderPage()
    expect(screen.getByText('正在加载工作台')).toBeInTheDocument()

    resolveRequest(coordinatorSnapshot)

    expect(await screen.findByRole('heading', { level: 4, name: '工作台' })).toBeInTheDocument()
    expect(screen.getByText('测试旅行社')).toBeInTheDocument()
    expect(screen.getByText('计调工作台')).toBeInTheDocument()
    expect(screen.getByText('真实零值')).toBeInTheDocument()
    expect(screen.getByText('0')).toBeInTheDocument()
    expect(screen.getByText('缺失值')).toBeInTheDocument()
    expect(screen.getByText('-')).toBeInTheDocument()
    expect(screen.getByText('当前模块暂无待处理数据，可稍后刷新查看')).toBeInTheDocument()
    expect(screen.getByText(/数据更新时间/)).toBeInTheDocument()
  })

  it('renders the permission-backed primary action and navigates to departure creation', async () => {
    vi.mocked(getWorkbench).mockResolvedValue(coordinatorSnapshot)
    const user = userEvent.setup()
    renderPage()

    const action = await screen.findByRole('button', { name: /新建发团/ })
    expect(action).toHaveClass('ant-btn-primary')
    await user.click(action)
    expect(navigate).toHaveBeenCalledWith({ to: '/departure/new' })
  })

  it('renders coordinator metrics and three-layer departure facts with folded data gaps', async () => {
    vi.mocked(getWorkbench).mockResolvedValue(coordinatorDeliverySnapshot)
    const user = userEvent.setup()
    renderPage()

    expect(await screen.findByText('进行中发团')).toBeInTheDocument()
    expect(screen.getByText('未来 7 天发团')).toBeInTheDocument()
    expect(screen.getAllByText('可确认结清')).toHaveLength(2)
    const dataGapMetric = screen.getByLabelText('资料待补充')
    expect(dataGapMetric).toBeInTheDocument()
    expect(screen.getByText(/查看全部 9 项/)).toBeInTheDocument()
    expect(screen.getByText('周计调')).toBeInTheDocument()
    expect(screen.getByText('2026-07-21 至 2026-07-26')).toBeInTheDocument()
    expect(screen.getByText('今日出发')).toBeInTheDocument()
    expect(screen.getByText('编辑中')).toBeInTheDocument()
    expect(screen.getByText('无客源单')).toBeInTheDocument()
    expect(screen.getByText('无行程段')).toBeInTheDocument()
    expect(screen.getByText('另有 1 项')).toBeInTheDocument()
    expect(screen.getByText('待生成应收 2 个')).toBeInTheDocument()
    expect(screen.queryByText('无行程资源')).not.toBeInTheDocument()
    expect(screen.queryByText('存在执行风险')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '待生成应收' })).toBeInTheDocument()
    const receivableTooltip = screen.getByLabelText('待生成应收统计口径')
    expect(receivableTooltip).toBeInTheDocument()
    await user.hover(receivableTooltip)
    expect(await screen.findByText(
      '按尚未生成应收的客源单数统计，数据来自现存客源单与应收记录。',
    )).toBeInTheDocument()
    expect(screen.getByText('待生成客源单 5')).toBeInTheDocument()
    expect(screen.queryByText('待生成客源单 6')).not.toBeInTheDocument()
    expect(screen.getByText('可结清发团 5')).toBeInTheDocument()
    expect(screen.queryByText('可结清发团 6')).not.toBeInTheDocument()
    expect(screen.queryByText('待生成应付')).not.toBeInTheDocument()
    expect(screen.getByText('未来团量与客流')).toBeInTheDocument()

    const todayDeparture = screen.getByText('云南昆明 6 日游').closest('button')!
    const ongoingDeparture = screen.getByText('海南三亚 5 日游').closest('button')!
    const futureDeparture = screen.getByText('桂林研学团').closest('button')!
    expect(
      todayDeparture.compareDocumentPosition(ongoingDeparture)
        & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(
      ongoingDeparture.compareDocumentPosition(futureDeparture)
        & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()

    fireEvent.click(dataGapMetric)
    expect(navigate).toHaveBeenCalledWith({
      to: '/departure?operationalWindow=current_and_next_7_days&departureDataGap=any',
    })

    fireEvent.click(todayDeparture)
    expect(navigate).toHaveBeenCalledWith({ to: '/departure/departure-1' })

    fireEvent.click(screen.getByRole('button', { name: '查看全部待生成应收 7 项' }))
    expect(navigate).toHaveBeenCalledWith({
      to: '/source-orders?receivableGeneration=not_generated',
    })

    fireEvent.click(screen.getByText('待生成客源单 1').closest('button')!)
    expect(navigate).toHaveBeenCalledWith({
      to: '/departure/departure-1?tab=sourceOrders',
    })
  })

  it('renders coordinator trend tooltip semantics, date navigation and empty chart state', async () => {
    vi.mocked(getWorkbench).mockResolvedValue(coordinatorDeliverySnapshot)
    const user = userEvent.setup()
    renderPage()

    expect(await screen.findByLabelText('未来团量与客流')).toBeInTheDocument()
    expect(screen.getByTestId('workbench-trend-chart')).toBeInTheDocument()
    const tomorrow = screen.getByRole('button', {
      name: '出团日 2026-07-22，发团数 2，客人人数 15，资料待补充 1',
    })
    await user.hover(tomorrow)
    expect(await screen.findByText('日期：2026-07-22')).toBeInTheDocument()
    expect(screen.getByText('发团数：2')).toBeInTheDocument()
    expect(screen.getByText('客人人数：15')).toBeInTheDocument()
    expect(screen.getByText('资料待补充发团数：1')).toBeInTheDocument()

    await user.click(tomorrow)
    expect(navigate).toHaveBeenCalledWith({
      to: '/departure?startDateFrom=2026-07-22&startDateTo=2026-07-22&excludeClosed=1',
    })

    cleanup()
    vi.mocked(getWorkbench).mockResolvedValue(coordinatorTrendEmptySnapshot)
    renderPage()
    expect(await screen.findByText(
      '未来 14 天暂无发团，因此不绘制团量与客流趋势',
    )).toBeInTheDocument()
    expect(screen.queryByTestId('workbench-trend-chart')).not.toBeInTheDocument()
  })

  it('renders organization-admin scale metrics, in-progress marker, tooltip and month drill-down', async () => {
    vi.mocked(getWorkbench).mockResolvedValue(organizationAdminSnapshot)
    const user = userEvent.setup()
    renderPage()

    expect(await screen.findByText('企业管理员工作台')).toBeInTheDocument()
    expect(await screen.findByText('本月发团数')).toBeInTheDocument()
    expect(screen.getByText('本月客源人次')).toBeInTheDocument()
    expect(screen.getByLabelText('本月发团数')).toHaveTextContent('2')
    expect(screen.getByLabelText('本月客源人次')).toHaveTextContent('12')
    expect(screen.queryByText(/预测|环比|毛利/)).not.toBeInTheDocument()
    expect(await screen.findByTestId('workbench-trend-chart')).toBeInTheDocument()
    expect(screen.getByText('进行中')).toBeInTheDocument()

    const currentMonth = screen.getByRole('button', {
      name: '月份 2026-07，发团数 2，客源人次 12，本月进行中',
    })
    await user.hover(currentMonth)
    expect(await screen.findByText('月份：2026-07')).toBeInTheDocument()
    expect(screen.getByText('发团数：2')).toBeInTheDocument()
    expect(screen.getByText('客源人次：12')).toBeInTheDocument()

    await user.click(currentMonth)
    expect(navigate).toHaveBeenCalledWith({
      to: '/departure?startDateFrom=2026-07-01&startDateTo=2026-07-31',
    })

    fireEvent.click(screen.getByLabelText('本月发团数'))
    expect(navigate).toHaveBeenCalledWith({
      to: '/departure?startDateFrom=2026-07-01&startDateTo=2026-07-31',
    })

    fireEvent.click(screen.getByLabelText('本月客源人次'))
    expect(navigate).toHaveBeenCalledWith({
      to: '/departure?startDateFrom=2026-07-01&startDateTo=2026-07-31',
    })

    cleanup()
    vi.mocked(getWorkbench).mockResolvedValue(organizationAdminEmptySnapshot)
    renderPage()
    expect(await screen.findByText(
      '近 6 个月暂无发团，因此不绘制业务规模趋势',
    )).toBeInTheDocument()
    expect(screen.queryByTestId('workbench-trend-chart')).not.toBeInTheDocument()
    expect(screen.getByText('进行中')).toBeInTheDocument()
    const emptyMonth = screen.getByRole('button', {
      name: '月份 2026-07，发团数 0，客源人次 0，本月进行中',
    })
    await user.click(emptyMonth)
    expect(navigate).toHaveBeenCalledWith({
      to: '/departure?startDateFrom=2026-07-01&startDateTo=2026-07-31',
    })
  })

  it('renders organization-admin risk reasons, calm empty state and navigation', async () => {
    vi.mocked(getWorkbench).mockResolvedValue(organizationAdminSnapshot)
    renderPage()

    expect(await screen.findByText('经营风险摘要')).toBeInTheDocument()
    expect(screen.getByText('逾期应收')).toBeInTheDocument()
    expect(screen.getByText('待核销资金')).toBeInTheDocument()
    expect(screen.getByText('¥1,250.00')).toBeInTheDocument()
    expect(screen.getByText('¥468.00')).toBeInTheDocument()
    expect(screen.getByText(/3 个节点/)).toBeInTheDocument()
    expect(screen.getByText(/11 笔（收入 8 · 支出 3）/)).toBeInTheDocument()
    expect(screen.getByLabelText('高风险')).toBeInTheDocument()
    expect(screen.getByLabelText('需关注')).toBeInTheDocument()
    expect(screen.getByText(/应收逾期超过 30 天/)).toBeInTheDocument()
    expect(screen.getByText(/明天出发且资料待补充/)).toBeInTheDocument()
    expect(screen.getByText(/流水超过 7 天仍未完全核销/)).toBeInTheDocument()
    expect(screen.queryByText(/风险评分|综合评分|risk score/i)).not.toBeInTheDocument()
    expect(screen.getByText(/共 6 项/)).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('逾期应收'))
    expect(navigate).toHaveBeenCalledWith({
      to: '/finance/receivable?receivableFollowUp=overdue',
    })

    fireEvent.click(screen.getByLabelText('待核销资金'))
    expect(navigate).toHaveBeenCalledWith({
      to: '/finance/transactions?status=normal&pendingSettlement=1',
    })

    fireEvent.click(screen.getByLabelText('逾期应收超过 30 天'))
    expect(navigate).toHaveBeenCalledWith({
      to: '/finance/receivable?receivableFollowUp=aging_over_30',
    })

    fireEvent.click(screen.getByRole('button', { name: '高风险 逾期大额应收' }))
    expect(navigate).toHaveBeenCalledWith({
      to: '/finance/receivable?scheduleNo=AR-0001',
    })

    fireEvent.click(screen.getByRole('button', { name: '高风险 西藏林芝小团' }))
    expect(navigate).toHaveBeenCalledWith({
      to: '/departure/dep-risk-1',
    })

    cleanup()
    vi.mocked(getWorkbench).mockResolvedValue(organizationAdminNoRiskSnapshot)
    renderPage()
    expect(await screen.findByText('当前没有需要关注的经营风险')).toBeInTheDocument()
    expect(await screen.findByText('本月发团数')).toBeInTheDocument()
    expect(await screen.findByTestId('workbench-trend-chart')).toBeInTheDocument()
    expect(screen.getByText(/共 0 项/)).toBeInTheDocument()
  })

  it('renders finance receivable metrics, top follow-up, aging chart and navigation', async () => {
    vi.mocked(getWorkbench).mockResolvedValue(financeReceivablesSnapshot)
    renderPage()

    expect(await screen.findByText('财务工作台')).toBeInTheDocument()
    expect(await screen.findByText('逾期应收')).toBeInTheDocument()
    expect(screen.getByText('未来 7 天到期应收')).toBeInTheDocument()
    expect(screen.getByText('¥1,250.00')).toBeInTheDocument()
    expect(screen.getByText('¥800.00')).toBeInTheDocument()
    expect(screen.getAllByText(/3 个节点|2 个节点/).length).toBeGreaterThan(0)
    expect(await screen.findByText('逾期大额应收')).toBeInTheDocument()
    expect(screen.getByText('近期到期应收')).toBeInTheDocument()
    expect(screen.getAllByText(/^跟进项 /)).toHaveLength(6)
    expect(screen.getByRole('button', { name: /查看全部 9 项/ })).toBeInTheDocument()
    expect(await screen.findByTestId('workbench-aging-chart')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('逾期应收'))
    expect(navigate).toHaveBeenCalledWith({
      to: '/finance/receivable?receivableFollowUp=overdue',
    })

    fireEvent.click(screen.getByLabelText('未来 7 天到期应收'))
    expect(navigate).toHaveBeenCalledWith({
      to: '/finance/receivable?receivableFollowUp=due_within_7_days',
    })

    fireEvent.click(screen.getByRole('button', { name: /查看全部 9 项/ }))
    expect(navigate).toHaveBeenCalledWith({
      to: '/finance/receivable?receivableFollowUp=follow_up',
    })

    fireEvent.click(screen.getByRole('button', {
      name: '账龄 30 天以上，节点数 1，未收金额 ¥900.00',
    }))
    expect(navigate).toHaveBeenCalledWith({
      to: '/finance/receivable?receivableFollowUp=aging_over_30',
    })

    fireEvent.click(screen.getByRole('button', { name: '逾期大额应收' }))
    expect(navigate).toHaveBeenCalledWith({
      to: '/finance/receivable?scheduleNo=AR-0001',
    })

    cleanup()
    vi.mocked(getWorkbench).mockResolvedValue(financeReceivablesEmptySnapshot)
    renderPage()
    expect(await screen.findByText(
      '当前没有逾期应收，因此不绘制账龄分布',
    )).toBeInTheDocument()
    expect(screen.queryByTestId('workbench-aging-chart')).not.toBeInTheDocument()
    expect(screen.getByText('当前没有需要跟进的逾期或近期到期应收')).toBeInTheDocument()
  })

  it('renders finance funds metrics, top queues, type tags and navigation', async () => {
    vi.mocked(getWorkbench).mockResolvedValue(financeReceivablesSnapshot)
    renderPage()

    expect(await screen.findByText('待付款')).toBeInTheDocument()
    expect(screen.getAllByText('待核销流水').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('待生成账款')).toBeInTheDocument()
    expect(screen.getByText('¥215,400.00')).toBeInTheDocument()
    expect(screen.getByText('¥46,800.00')).toBeInTheDocument()
    expect(screen.getByText(/18 个节点/)).toBeInTheDocument()
    expect(screen.getByText(/11 笔（收入 8 · 支出 3）/)).toBeInTheDocument()
    expect(screen.getByText('收入')).toBeInTheDocument()
    expect(screen.getByText('支出')).toBeInTheDocument()
    expect(screen.getByText('待应收')).toBeInTheDocument()
    expect(screen.getByText('待应付')).toBeInTheDocument()
    expect(screen.getAllByText('发团已关闭').length).toBeGreaterThanOrEqual(2)
    expect(screen.queryByText('催付')).toBeNull()
    expect(screen.queryByText('到期催付')).toBeNull()

    fireEvent.click(screen.getByLabelText('待付款'))
    expect(navigate).toHaveBeenCalledWith({
      to: '/finance/payable?payableBalance=open_unpaid',
    })

    fireEvent.click(screen.getByLabelText('待核销流水'))
    expect(navigate).toHaveBeenCalledWith({
      to: '/finance/transactions?status=normal&pendingSettlement=1',
    })

    fireEvent.click(screen.getByRole('button', { name: /查看全部 3 项/ }))
    expect(navigate).toHaveBeenCalledWith({
      to: '/finance/transactions?status=normal&pendingSettlement=1',
    })

    fireEvent.click(screen.getByRole('button', { name: /查看全部 2 项/ }))
    expect(navigate).toHaveBeenCalledWith({
      to: '/departure/account-generation-gaps',
    })

    fireEvent.click(screen.getByRole('button', { name: '阳光学校' }))
    expect(navigate).toHaveBeenCalledWith({
      to: '/finance/transactions?status=normal&transactionNo=TX-0001',
    })

    fireEvent.click(screen.getByRole('button', { name: '云南昆明六日游客源单' }))
    expect(navigate).toHaveBeenCalledWith({
      to: '/departure/dep-1?tab=sourceOrders',
    })
  })

  it('does not render an action when the current session lacks its permission', async () => {
    useAuthStore.setState({ actionKeys: [] })
    vi.mocked(getWorkbench).mockResolvedValue(coordinatorSnapshot)
    renderPage()

    expect(await screen.findByText('测试旅行社')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /新建发团/ })).not.toBeInTheDocument()
  })

  it('renders a retryable first-load error', async () => {
    vi.mocked(getWorkbench)
      .mockRejectedValueOnce(new Error('网络异常'))
      .mockResolvedValueOnce(coordinatorSnapshot)
    const user = userEvent.setup()
    renderPage()

    expect(await screen.findByText('工作台加载失败')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /重\s*试/ }))
    expect(await screen.findByText('测试旅行社')).toBeInTheDocument()
    expect(getWorkbench).toHaveBeenCalledTimes(2)
  })

  it('keeps the previous snapshot and asOf when a background refresh fails', async () => {
    let rejectRefresh!: (reason: Error) => void
    vi.mocked(getWorkbench)
      .mockResolvedValueOnce(coordinatorSnapshot)
      .mockImplementationOnce(
        () => new Promise((_resolve, reject) => { rejectRefresh = reject }),
      )
    const user = userEvent.setup()
    renderPage()

    expect(await screen.findByText('测试旅行社')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /刷新/ }))
    expect(await screen.findByText(/正在更新/)).toBeInTheDocument()

    rejectRefresh(new Error('刷新失败'))

    expect(await screen.findByText('刷新失败，已保留上次数据')).toBeInTheDocument()
    expect(screen.getByText('测试旅行社')).toBeInTheDocument()
    expect(screen.getByText(/数据更新时间/)).toBeInTheDocument()
    await waitFor(() => expect(getWorkbench).toHaveBeenCalledTimes(2))
  })
})
