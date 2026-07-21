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
}))

const coordinatorSnapshot = {
  template: 'coordinator' as const,
  organization: { id: 'org-1', name: '测试旅行社' },
  asOf: '2026-07-21T02:03:04.000Z',
  modules: [
    {
      key: 'coordinator-departures' as const,
      title: '近期发团',
      description: '掌握近期发团与资料状态。',
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
      description: '优先查看进行中、近期出发及资料待补充的发团。',
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
      description: '查看可确认结清与待生成应收。',
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
      description: '查看未来 14 天每日出发团数、客人人数与资料待补充发团数。',
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
      description: '查看 Organization 近 6 个月发团数与客源人次；本月按当前业务事实实时回算。',
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
      description: '查看应收与资金相关的可解释风险。',
      metrics: [],
      items: [],
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
  modules: organizationAdminSnapshot.modules.map((module) =>
    module.key === 'organization-scale'
      ? {
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
    expect(screen.getByText(/柱顶红色数字表示「资料待补充」发团数/)).toBeInTheDocument()
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
    expect(screen.getByText('本月发团数')).toBeInTheDocument()
    expect(screen.getByText('本月客源人次')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.queryByText(/预测|环比|收入|支出|毛利/)).not.toBeInTheDocument()
    expect(screen.getByTestId('workbench-trend-chart')).toBeInTheDocument()
    expect(screen.getByText('本月进行中')).toBeInTheDocument()

    const currentMonth = screen.getByRole('button', {
      name: '月份 2026-07，发团数 2，客源人次 12，本月进行中，按当前数据统计',
    })
    await user.hover(currentMonth)
    expect(await screen.findByText('月份：2026-07')).toBeInTheDocument()
    expect(screen.getByText('发团数：2')).toBeInTheDocument()
    expect(screen.getByText('客源人次：12')).toBeInTheDocument()
    expect(screen.getAllByText('按当前数据统计').length).toBeGreaterThan(0)

    await user.click(currentMonth)
    expect(navigate).toHaveBeenCalledWith({
      to: '/departure?startDateFrom=2026-07-01&startDateTo=2026-07-31',
    })

    fireEvent.click(screen.getByLabelText('本月发团数'))
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
