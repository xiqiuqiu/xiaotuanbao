import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfigProvider } from 'antd'
import { useEffect, useRef, useState, type ReactElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RouteLedgerResult } from '@/types/api'
import { RouteLedgerViewPanel } from './RouteLedgerViewPanel'

const listDepartureRouteNames = vi.fn()
const getDepartureRouteLedger = vi.fn()
const downloadDepartureRouteLedger = vi.fn()
const navigate = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    params,
    search,
    onClick,
  }: {
    children: React.ReactNode
    to: string
    params?: { departureId: string }
    search?: { tab?: string }
    onClick?: (event: React.MouseEvent) => void
  }) => (
    <a
      href={`${to.replace('$departureId', params?.departureId ?? '')}?tab=${search?.tab ?? ''}`}
      onClick={onClick}
    >
      {children}
    </a>
  ),
  useNavigate: () => navigate,
}))

vi.mock('@/services/departure.service', () => ({
  listDepartureRouteNames: (...args: unknown[]) => listDepartureRouteNames(...args),
  getDepartureRouteLedger: (...args: unknown[]) => getDepartureRouteLedger(...args),
  downloadDepartureRouteLedger: (...args: unknown[]) => downloadDepartureRouteLedger(...args),
}))

const routeGroupFixture = {
  routeName: '伊犁环线',
  totals: {
    orderCount: 3,
    guestCount: 6,
    grossReceivableCents: 520000,
    netReceivableCents: 520000,
    partnerCollectedCents: 430000,
    guestCollectCents: 90000,
  },
  outsource: {
    totalAmountCents: 350000,
    items: [
      {
        id: 'os-a1',
        supplierName: '伊犁拼出社',
        amountCents: 80000,
        title: '伊犁段拼出',
      },
      {
        id: 'os-a2',
        supplierName: '那拉提拼出社',
        amountCents: 120000,
        title: '那拉提段拼出',
      },
      {
        id: 'os-b1',
        supplierName: '独库拼出社',
        amountCents: 150000,
        title: '独库整段拼出',
      },
    ],
  },
  departures: [
    {
      departureId: 'dep-a',
      departureNo: 'XTB202607150001',
      departureName: '【表头冗余】同日团 A',
      startDate: '2026-07-15',
      totals: {
        orderCount: 2,
        guestCount: 3,
        grossReceivableCents: 270000,
        netReceivableCents: 270000,
        partnerCollectedCents: 180000,
        guestCollectCents: 90000,
      },
      outsource: {
        totalAmountCents: 200000,
        items: [
          {
            id: 'os-a1',
            supplierName: '伊犁拼出社',
            amountCents: 80000,
            title: '伊犁段拼出',
          },
          {
            id: 'os-a2',
            supplierName: '那拉提拼出社',
            amountCents: 120000,
            title: '那拉提段拼出',
          },
        ],
      },
      costResources: [],
      sourceOrders: [
        {
          id: 'so-a',
          departureId: 'dep-a',
          partnerId: 'p1',
          partnerName: '华东国旅',
          displayName: '华东国旅',
          guestRepresentativeName: null,
          guestRepresentativePhone: null,
          adultGuestCount: 2,
          childGuestCount: 0,
          guestCount: 2,
          adultUnitPriceCents: 90000,
          childUnitPriceCents: 0,
          grossReceivableCents: 180000,
          netReceivableCents: 180000,
          partnerCollectedCents: 180000,
          guestCollectCents: 0,
          notes: '同日团 A',
        },
        {
          id: 'so-a2',
          departureId: 'dep-a',
          partnerId: 'p2',
          partnerName: '华南国旅',
          displayName: '华南国旅',
          guestRepresentativeName: '赵六',
          guestRepresentativePhone: '13700001111',
          adultGuestCount: 1,
          childGuestCount: 0,
          guestCount: 1,
          adultUnitPriceCents: 90000,
          childUnitPriceCents: 0,
          grossReceivableCents: 90000,
          netReceivableCents: 90000,
          partnerCollectedCents: 0,
          guestCollectCents: 90000,
          notes: null,
        },
      ],
    },
    {
      departureId: 'dep-b',
      departureNo: 'XTB202607150002',
      departureName: '【表头冗余】同日团 B',
      startDate: '2026-07-15',
      totals: {
        orderCount: 1,
        guestCount: 3,
        grossReceivableCents: 250000,
        netReceivableCents: 250000,
        partnerCollectedCents: 250000,
        guestCollectCents: 0,
      },
      outsource: {
        totalAmountCents: 150000,
        items: [
          {
            id: 'os-b1',
            supplierName: '独库拼出社',
            amountCents: 150000,
            title: '独库整段拼出',
          },
        ],
      },
      costResources: [],
      sourceOrders: [
        {
          id: 'so-b',
          departureId: 'dep-b',
          partnerId: 'p1',
          partnerName: '华东国旅',
          displayName: '华东国旅',
          guestRepresentativeName: '陈志明',
          guestRepresentativePhone: '13800002211',
          adultGuestCount: 2,
          childGuestCount: 1,
          guestCount: 3,
          adultUnitPriceCents: 100000,
          childUnitPriceCents: 50000,
          grossReceivableCents: 250000,
          netReceivableCents: 250000,
          partnerCollectedCents: 250000,
          guestCollectCents: 0,
          notes: '同日团 B',
        },
      ],
    },
  ],
}

const ledgerFixture: RouteLedgerResult = {
  routeName: '伊犁环线',
  startDateFrom: null,
  startDateTo: null,
  dateBlocks: [
    {
      startDate: '2026-07-15',
      totals: routeGroupFixture.totals,
      outsource: {
        totalAmountCents: 350000,
        items: routeGroupFixture.outsource.items,
      },
      routes: [routeGroupFixture],
    },
  ],
}

const dateOnlyFixture: RouteLedgerResult = {
  routeName: null,
  startDateFrom: '2026-07-15',
  startDateTo: '2026-07-15',
  dateBlocks: [
    {
      startDate: '2026-07-15',
      totals: {
        orderCount: 4,
        guestCount: 8,
        grossReceivableCents: 640000,
        netReceivableCents: 640000,
        partnerCollectedCents: 550000,
        guestCollectCents: 90000,
      },
      outsource: { totalAmountCents: 350000, items: routeGroupFixture.outsource.items },
      routes: [
        {
          routeName: '阿勒泰拼车',
          totals: {
            orderCount: 1,
            guestCount: 2,
            grossReceivableCents: 120000,
            netReceivableCents: 120000,
            partnerCollectedCents: 120000,
            guestCollectCents: 0,
          },
          outsource: { totalAmountCents: 0, items: [] },
          departures: [
            {
              departureId: 'dep-other',
              departureNo: 'XTB202607150099',
              departureName: '阿勒泰团',
              startDate: '2026-07-15',
              totals: {
                orderCount: 1,
                guestCount: 2,
                grossReceivableCents: 120000,
                netReceivableCents: 120000,
                partnerCollectedCents: 120000,
                guestCollectCents: 0,
              },
              outsource: { totalAmountCents: 0, items: [] },
              costResources: [],
      sourceOrders: [
                {
                  id: 'so-other',
                  departureId: 'dep-other',
                  partnerId: 'p1',
                  partnerName: '华东国旅',
                  displayName: '华东国旅',
                  guestRepresentativeName: null,
                  guestRepresentativePhone: null,
                  adultGuestCount: 2,
                  childGuestCount: 0,
                  guestCount: 2,
                  adultUnitPriceCents: 60000,
                  childUnitPriceCents: 0,
                  grossReceivableCents: 120000,
                  netReceivableCents: 120000,
                  partnerCollectedCents: 120000,
                  guestCollectCents: 0,
                  notes: '阿勒泰团',
                },
              ],
            },
          ],
        },
        routeGroupFixture,
      ],
    },
  ],
}

type PanelState = {
  routeName?: string
  startDateRange: [string | undefined, string | undefined] | null
}

function StatefulPanel({
  initial = { routeName: undefined, startDateRange: null },
  onFiltersChange,
}: {
  initial?: PanelState
  onFiltersChange?: (next: PanelState) => void
}) {
  const [routeName, setRouteName] = useState(initial.routeName)
  const [startDateRange, setStartDateRange] = useState(initial.startDateRange)
  const didAutoSelectRouteRef = useRef(false)
  const { data: routeNamesData, isLoading: routeNamesLoading } = useQuery({
    queryKey: ['departures', 'route-names'],
    queryFn: () => listDepartureRouteNames(),
  })

  useEffect(() => {
    if (didAutoSelectRouteRef.current) return
    const hasAxes = Boolean(
      routeName?.trim() || startDateRange?.[0]?.trim() || startDateRange?.[1]?.trim(),
    )
    if (hasAxes) {
      didAutoSelectRouteRef.current = true
      return
    }
    if (routeNamesLoading) return
    const first = routeNamesData?.items.find((name) => name.trim().length > 0)?.trim()
    didAutoSelectRouteRef.current = true
    if (first) {
      setRouteName(first)
      onFiltersChange?.({ routeName: first, startDateRange })
    }
  }, [
    onFiltersChange,
    routeName,
    routeNamesData,
    routeNamesLoading,
    startDateRange,
  ])

  return (
    <RouteLedgerViewPanel
      routeNames={routeNamesData?.items ?? []}
      routeNamesLoading={routeNamesLoading}
      routeName={routeName}
      startDateRange={startDateRange}
      onRouteNameChange={(value) => {
        setRouteName(value)
        onFiltersChange?.({ routeName: value, startDateRange })
      }}
      onStartDateRangeChange={(value) => {
        setStartDateRange(value)
        onFiltersChange?.({ routeName, startDateRange: value })
      }}
      onSwitchToDepartureList={vi.fn()}
    />
  )
}

function renderPanel(ui: ReactElement = <StatefulPanel />) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <ConfigProvider>{ui}</ConfigProvider>
    </QueryClientProvider>,
  )
}

async function selectRoute(user: ReturnType<typeof userEvent.setup>) {
  const combobox = await screen.findByRole('combobox', { name: '路线名称' })
  await user.click(combobox)
  await user.click(
    await screen.findByText('伊犁环线', {
      selector: '.ant-select-item-option-content',
    }),
  )
  await waitFor(() => {
    expect(getDepartureRouteLedger).toHaveBeenCalled()
  })
}

/** 匹配日报表头身份区：路线名链接 + 团号·出团日次级行（按团号唯一定位）。 */
function expectReportIdentity(routeName: string, departureNo: string, dateLabel: string) {
  const meta = screen.getByText(
    (_, el) =>
      el instanceof HTMLElement
      && el.classList.contains('ant-typography')
      && el.textContent === `${departureNo} · ${dateLabel}`,
  )
  const identity = meta.parentElement
  expect(identity).not.toBeNull()
  expect(within(identity as HTMLElement).getByRole('link', { name: routeName })).toBeInTheDocument()
}

describe('RouteLedgerViewPanel', () => {
  beforeEach(() => {
    listDepartureRouteNames.mockReset()
    getDepartureRouteLedger.mockReset()
    downloadDepartureRouteLedger.mockReset()
    navigate.mockReset()
    listDepartureRouteNames.mockResolvedValue({
      items: ['伊犁环线', '阿勒泰拼车'],
    })
    getDepartureRouteLedger.mockResolvedValue(ledgerFixture)
    downloadDepartureRouteLedger.mockResolvedValue(undefined)
  })

  afterEach(() => {
    cleanup()
  })

  it('进入线路视图且无筛选时，默认选中路线列表首项并查询', async () => {
    const onFiltersChange = vi.fn()
    renderPanel(<StatefulPanel onFiltersChange={onFiltersChange} />)

    await waitFor(() => {
      expect(onFiltersChange).toHaveBeenCalledWith({
        routeName: '伊犁环线',
        startDateRange: null,
      })
    })

    await waitFor(() => {
      expect(getDepartureRouteLedger).toHaveBeenCalledWith(
        { routeName: '伊犁环线' },
        expect.anything(),
      )
    })

    expect(screen.queryByText('请选择路线名称或出团日期')).not.toBeInTheDocument()
  })

  it('已有出团日期轴时不覆盖用户筛选、不强制默认路线', async () => {
    renderPanel(
      <StatefulPanel
        initial={{
          routeName: undefined,
          startDateRange: ['2026-07-15', '2026-07-15'],
        }}
      />,
    )

    await waitFor(() => {
      expect(getDepartureRouteLedger).toHaveBeenCalledWith(
        { startDateFrom: '2026-07-15', startDateTo: '2026-07-15' },
        expect.anything(),
      )
    })

    expect(screen.queryByText('请选择路线名称或出团日期')).not.toBeInTheDocument()
  })

  it('筛选栏导出 Excel：结果就绪可点，并按当前筛选下载', async () => {
    const user = userEvent.setup()
    renderPanel(
      <StatefulPanel initial={{ routeName: '伊犁环线', startDateRange: null }} />,
    )

    const exportBtn = await screen.findByRole('button', { name: /导出 Excel/ })
    await waitFor(() => {
      expect(exportBtn).not.toBeDisabled()
    })

    await user.click(exportBtn)
    expect(downloadDepartureRouteLedger).toHaveBeenCalledWith({ routeName: '伊犁环线' })
  })

  it('日报表头不重复展示团名（与标题冗余）', async () => {
    renderPanel(
      <StatefulPanel initial={{ routeName: '伊犁环线', startDateRange: null }} />,
    )

    await waitFor(() => {
      expectReportIdentity('伊犁环线', 'XTB202607150001', '2026年7月15日')
    })

    expect(screen.queryByText('【表头冗余】同日团 A')).not.toBeInTheDocument()
    expect(screen.queryByText('【表头冗余】同日团 B')).not.toBeInTheDocument()
  })

  it('同日多发团各出一份日报表，合计互不合并 (#221)', async () => {
    renderPanel(
      <StatefulPanel initial={{ routeName: '伊犁环线', startDateRange: null }} />,
    )

    await waitFor(() => {
      expectReportIdentity('伊犁环线', 'XTB202607150001', '2026年7月15日')
    })

    expect(getDepartureRouteLedger).toHaveBeenCalledWith(
      { routeName: '伊犁环线' },
      expect.anything(),
    )
    expectReportIdentity('伊犁环线', 'XTB202607150002', '2026年7月15日')
    expect(screen.getAllByText('同日团 A').length).toBeGreaterThan(0)
    expect(screen.getAllByText('同日团 B').length).toBeGreaterThan(0)

    const headers = screen.getAllByRole('columnheader').map((el) => el.textContent ?? '')
    // 两张表共用列结构；取首张表头（去重前会重复，故只断言包含关键列且无「发团」列）
    expect(headers).toContain('发客客户')
    expect(headers).not.toContain('发团')
    expect(screen.queryByRole('columnheader', { name: /拼出/ })).not.toBeInTheDocument()
    expect(screen.queryByText('实收业务')).not.toBeInTheDocument()

    const tables = screen.getAllByRole('table')
    expect(tables).toHaveLength(2)
    expect(within(tables[0]).getByText('合计')).toBeInTheDocument()
    expect(within(tables[0]).getByText('2 单')).toBeInTheDocument()
    expect(within(tables[1]).getByText('1 单')).toBeInTheDocument()
    expect(screen.queryByText('3 单')).not.toBeInTheDocument()
  })

  it('仅选有效出团日期时请求不含 routeName，一团一表且无路线段加总 (#221)', async () => {
    getDepartureRouteLedger.mockResolvedValue(dateOnlyFixture)

    renderPanel(
      <StatefulPanel
        initial={{
          routeName: undefined,
          startDateRange: ['2026-07-15', '2026-07-15'],
        }}
      />,
    )

    await waitFor(() => {
      expect(getDepartureRouteLedger).toHaveBeenCalledWith(
        { startDateFrom: '2026-07-15', startDateTo: '2026-07-15' },
        expect.anything(),
      )
      expectReportIdentity('阿勒泰拼车', 'XTB202607150099', '2026年7月15日')
    })

    expectReportIdentity('伊犁环线', 'XTB202607150001', '2026年7月15日')
    expectReportIdentity('伊犁环线', 'XTB202607150002', '2026年7月15日')
    // 同日首日不插日期分隔；三份独立日报
    expect(screen.queryByRole('heading', { name: '2026-07-15' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('table')).toHaveLength(3)
  })

  it('未选路线且日期跨度超过 7 天时提示校验错误且不请求 (#221)', async () => {
    renderPanel(
      <StatefulPanel
        initial={{
          routeName: undefined,
          startDateRange: ['2026-07-10', '2026-07-17'],
        }}
      />,
    )

    await waitFor(() => {
      expect(listDepartureRouteNames).toHaveBeenCalled()
    })

    expect(screen.getByText('未选路线时，出团日期跨度最多 7 天')).toBeInTheDocument()
    expect(getDepartureRouteLedger).not.toHaveBeenCalled()
  })

  it('筛选变更通过回调上报，便于写入 URL (#221)', async () => {
    const onFiltersChange = vi.fn()
    const user = userEvent.setup()
    renderPanel(<StatefulPanel onFiltersChange={onFiltersChange} />)

    await selectRoute(user)

    expect(onFiltersChange).toHaveBeenCalledWith({
      routeName: '伊犁环线',
      startDateRange: null,
    })
  })

  it('拼出仅在拼出分面展示，不进客源列、不跨团合并', async () => {
    const user = userEvent.setup()
    renderPanel(
      <StatefulPanel initial={{ routeName: '伊犁环线', startDateRange: null }} />,
    )

    await waitFor(() => {
      expect(screen.getAllByRole('radio', { name: '拼出往来' })).toHaveLength(2)
    })

    expect(screen.getAllByRole('radio', { name: '拼出往来' })).toHaveLength(2)
    expect(screen.getAllByText('¥2,000.00').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('¥1,500.00').length).toBeGreaterThanOrEqual(1)
    expect(screen.queryByText('伊犁拼出社')).not.toBeInTheDocument()

    const outsourceTabs = screen.getAllByText('拼出往来')
    await user.click(outsourceTabs[0])

    expect(await screen.findByText('伊犁拼出社')).toBeInTheDocument()
    expect(screen.getByText('伊犁段拼出')).toBeInTheDocument()
    expect(screen.getByText('那拉提拼出社')).toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: '拼出' })).not.toBeInTheDocument()
  })

  it('展示游客代表、电话与拼入价/人数成人儿童分列；名单空则代表为 -（#185）', async () => {
    renderPanel(
      <StatefulPanel initial={{ routeName: '伊犁环线', startDateRange: null }} />,
    )

    await waitFor(() => {
      expect(screen.getByText('陈志明')).toBeInTheDocument()
    })

    const tables = screen.getAllByRole('table')
    const tableB = tables[1]
    const tableBBody = tableB.querySelector('tbody')!
    expect(within(tableBBody as HTMLElement).getByText('1000')).toBeInTheDocument()
    expect(within(tableBBody as HTMLElement).getByText('500')).toBeInTheDocument()
    expect(within(tableB).getByText('13800002211')).toBeInTheDocument()
    expect(within(tables[0]).getAllByText('900').length).toBeGreaterThan(0)
  })

  it('点击发团名称进入发团详情，点击客源行进入客源管理路径（#185）', async () => {
    const user = userEvent.setup()
    renderPanel(
      <StatefulPanel initial={{ routeName: '伊犁环线', startDateRange: null }} />,
    )

    await waitFor(() => {
      expectReportIdentity('伊犁环线', 'XTB202607150001', '2026年7月15日')
    })

    const metaA = screen.getByText(
      (_, el) =>
        el instanceof HTMLElement
        && el.classList.contains('ant-typography')
        && el.textContent === 'XTB202607150001 · 2026年7月15日',
    )
    const linkA = within(metaA.parentElement as HTMLElement).getByRole('link', {
      name: '伊犁环线',
    })
    expect(linkA).toHaveAttribute('href', expect.stringContaining('dep-a'))

    const tables = screen.getAllByRole('table')
    await user.click(within(tables[1]).getByText('陈志明'))
    expect(navigate).toHaveBeenCalledWith(
      expect.objectContaining({
        to: '/departure/$departureId',
        params: { departureId: 'dep-b' },
        search: { tab: 'sourceOrders' },
      }),
    )
  })

  it('有效查询无匹配发团时展示空结果态 (#221)', async () => {
    getDepartureRouteLedger.mockResolvedValue({
      routeName: '伊犁环线',
      startDateFrom: null,
      startDateTo: null,
      dateBlocks: [],
    })

    renderPanel(
      <StatefulPanel initial={{ routeName: '伊犁环线', startDateRange: null }} />,
    )

    await waitFor(() => {
      expect(screen.getByText('「伊犁环线」暂无匹配发团')).toBeInTheDocument()
    })
  })

  it('无客源发团仍出完整日报壳 (#221)', async () => {
    getDepartureRouteLedger.mockResolvedValue({
      routeName: '伊犁环线',
      startDateFrom: null,
      startDateTo: null,
      dateBlocks: [
        {
          startDate: '2026-07-15',
          totals: {
            orderCount: 0,
            guestCount: 0,
            grossReceivableCents: 0,
            netReceivableCents: 0,
            partnerCollectedCents: 0,
            guestCollectCents: 0,
          },
          outsource: { totalAmountCents: 0, items: [] },
          routes: [
            {
              routeName: '伊犁环线',
              totals: {
                orderCount: 0,
                guestCount: 0,
                grossReceivableCents: 0,
                netReceivableCents: 0,
                partnerCollectedCents: 0,
                guestCollectCents: 0,
              },
              outsource: { totalAmountCents: 0, items: [] },
              departures: [
                {
                  departureId: 'dep-empty',
                  departureNo: 'XTB202607150000',
                  departureName: '空客源团',
                  startDate: '2026-07-15',
                  totals: {
                    orderCount: 0,
                    guestCount: 0,
                    grossReceivableCents: 0,
                    netReceivableCents: 0,
                    partnerCollectedCents: 0,
                    guestCollectCents: 0,
                  },
                  outsource: { totalAmountCents: 0, items: [] },
                  costResources: [],
      sourceOrders: [],
                },
              ],
            },
          ],
        },
      ],
    })

    renderPanel(
      <StatefulPanel initial={{ routeName: '伊犁环线', startDateRange: null }} />,
    )

    await waitFor(() => {
      expectReportIdentity('伊犁环线', 'XTB202607150000', '2026年7月15日')
    })
    expect(screen.getByText('暂无客源单')).toBeInTheDocument()
    expect(screen.getByText('0 单')).toBeInTheDocument()
  })

  it('跨多天结果在换日处显示轻量日期分隔 (#221)', async () => {
    getDepartureRouteLedger.mockResolvedValue({
      routeName: '伊犁环线',
      startDateFrom: '2026-07-15',
      startDateTo: '2026-07-16',
      dateBlocks: [
        ledgerFixture.dateBlocks[0],
        {
          startDate: '2026-07-16',
          totals: routeGroupFixture.departures[0].totals,
          outsource: routeGroupFixture.departures[0].outsource,
          routes: [
            {
              routeName: '伊犁环线',
              totals: routeGroupFixture.departures[0].totals,
              outsource: routeGroupFixture.departures[0].outsource,
              departures: [
                {
                  ...routeGroupFixture.departures[0],
                  departureId: 'dep-day2',
                  departureNo: 'XTB202607160001',
                  departureName: '次日团',
                  startDate: '2026-07-16',
                },
              ],
            },
          ],
        },
      ],
    })

    renderPanel(
      <StatefulPanel
        initial={{
          routeName: '伊犁环线',
          startDateRange: ['2026-07-15', '2026-07-16'],
        }}
      />,
    )

    await waitFor(() => {
      expect(screen.getByRole('separator', { name: '2026年7月16日' })).toBeInTheDocument()
    })
    expect(screen.queryByRole('separator', { name: '2026年7月15日' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('table')).toHaveLength(3)
  })
})
