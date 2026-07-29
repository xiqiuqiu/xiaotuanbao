import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfigProvider } from 'antd'
import { useState, type ReactElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RouteLedgerResult } from '@/types/api'
import { RouteLedgerViewPanel } from './RouteLedgerViewPanel'

const listDepartureRouteNames = vi.fn()
const getDepartureRouteLedger = vi.fn()
const navigate = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    params,
    search,
  }: {
    children: React.ReactNode
    to: string
    params?: { departureId: string }
    search?: { tab?: string }
  }) => (
    <a
      href={`${to.replace('$departureId', params?.departureId ?? '')}?tab=${search?.tab ?? ''}`}
    >
      {children}
    </a>
  ),
  useNavigate: () => navigate,
}))

vi.mock('@/services/departure.service', () => ({
  listDepartureRouteNames: (...args: unknown[]) => listDepartureRouteNames(...args),
  getDepartureRouteLedger: (...args: unknown[]) => getDepartureRouteLedger(...args),
}))

const ledgerFixture: RouteLedgerResult = {
  routeName: '伊犁环线',
  startDateFrom: null,
  startDateTo: null,
  dateBlocks: [
    {
      startDate: '2026-07-15',
      totals: {
        orderCount: 2,
        guestCount: 5,
        grossReceivableCents: 420000,
        netReceivableCents: 420000,
        partnerCollectedCents: 420000,
        guestCollectCents: 0,
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
      routes: [
        {
          routeName: '伊犁环线',
          totals: {
            orderCount: 2,
            guestCount: 5,
            grossReceivableCents: 420000,
            netReceivableCents: 420000,
            partnerCollectedCents: 420000,
            guestCollectCents: 0,
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
          departures: [
            {
              departureId: 'dep-a',
              departureNo: 'XTB202607150001',
              departureName: '同日团 A',
              startDate: '2026-07-15',
              totals: {
                orderCount: 1,
                guestCount: 2,
                grossReceivableCents: 180000,
                netReceivableCents: 180000,
                partnerCollectedCents: 180000,
                guestCollectCents: 0,
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
              ],
            },
            {
              departureId: 'dep-b',
              departureNo: 'XTB202607150002',
              departureName: '同日团 B',
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
        },
      ],
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
        orderCount: 2,
        guestCount: 4,
        grossReceivableCents: 300000,
        netReceivableCents: 300000,
        partnerCollectedCents: 300000,
        guestCollectCents: 0,
      },
      outsource: { totalAmountCents: 0, items: [] },
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
        {
          routeName: '伊犁环线',
          totals: ledgerFixture.dateBlocks[0].routes[0].totals,
          outsource: ledgerFixture.dateBlocks[0].routes[0].outsource,
          departures: ledgerFixture.dateBlocks[0].routes[0].departures,
        },
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

  return (
    <RouteLedgerViewPanel
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
  await user.click(await screen.findByRole('option', { name: '伊犁环线' }))
  await waitFor(() => {
    expect(getDepartureRouteLedger).toHaveBeenCalled()
  })
}

describe('RouteLedgerViewPanel', () => {
  beforeEach(() => {
    listDepartureRouteNames.mockReset()
    getDepartureRouteLedger.mockReset()
    navigate.mockReset()
    listDepartureRouteNames.mockResolvedValue({
      items: ['伊犁环线', '阿勒泰拼车'],
    })
    getDepartureRouteLedger.mockResolvedValue(ledgerFixture)
  })

  afterEach(() => {
    cleanup()
  })

  it('未选路线与日期时显示空态，不发起查询 (#221)', async () => {
    renderPanel()

    await waitFor(() => {
      expect(listDepartureRouteNames).toHaveBeenCalled()
    })

    expect(screen.getByText('请选择路线名称或出团日期')).toBeInTheDocument()
    expect(screen.getByText(/也可只选出团日期/)).toBeInTheDocument()
    expect(getDepartureRouteLedger).not.toHaveBeenCalled()
  })

  it('URL 传入路线时直接查询，按日→发团渲染且无路线段 chrome (#221)', async () => {
    renderPanel(
      <StatefulPanel initial={{ routeName: '伊犁环线', startDateRange: null }} />,
    )

    await waitFor(() => {
      expect(getDepartureRouteLedger).toHaveBeenCalledWith(
        { routeName: '伊犁环线' },
        expect.anything(),
      )
      expect(screen.getByText('2026-07-15')).toBeInTheDocument()
    })

    expect(screen.getByText(/XTB202607150001/)).toBeInTheDocument()
    expect(screen.getByText(/XTB202607150002/)).toBeInTheDocument()
    // 有路线：日标题下直接发团，不出现「路线合计」分段
    expect(screen.queryByText(/路线合计/)).not.toBeInTheDocument()
    expect(screen.queryAllByRole('heading', { name: '伊犁环线' })).toHaveLength(0)

    for (const title of [
      '发客客户',
      '游客代表',
      '人数',
      '拼入价',
      '原始团款',
      '结算金额',
      '客户已收',
      '我方代收',
      '备注',
    ]) {
      expect(screen.getAllByRole('columnheader', { name: title }).length).toBeGreaterThan(0)
    }
    expect(screen.queryByRole('columnheader', { name: /拼出/ })).not.toBeInTheDocument()
    expect(screen.queryByText('实收业务')).not.toBeInTheDocument()

    const tables = screen.getAllByRole('table')
    expect(tables).toHaveLength(2)
    for (const table of tables) {
      expect(within(table).queryByRole('spinbutton')).not.toBeInTheDocument()
      expect(within(table).queryByRole('textbox')).not.toBeInTheDocument()
    }
    expect(screen.getAllByText(/同日团 A/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/同日团 B/).length).toBeGreaterThan(0)
  })

  it('仅选有效出团日期时请求不含 routeName，并展示路线段 (#221)', async () => {
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
      expect(screen.getByRole('heading', { name: '阿勒泰拼车' })).toBeInTheDocument()
    })

    expect(screen.getByRole('heading', { name: '伊犁环线' })).toBeInTheDocument()
    expect(screen.getAllByText(/路线合计/).length).toBeGreaterThan(0)
    expect(screen.getByText(/XTB202607150099/)).toBeInTheDocument()
    expect(screen.getByText(/XTB202607150001/)).toBeInTheDocument()
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

  it('日/发团标题展示拼出汇总：单拼出写清承接方，多拼出列表呈现，不进客源列', async () => {
    renderPanel(
      <StatefulPanel initial={{ routeName: '伊犁环线', startDateRange: null }} />,
    )

    await waitFor(() => {
      expect(screen.getAllByText(/拼出 2 项 · 合计/).length).toBeGreaterThan(0)
    })

    expect(screen.getAllByText(/伊犁拼出社/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/那拉提拼出社/).length).toBeGreaterThan(0)
    expect(screen.getByText(/拼出 · 独库拼出社/)).toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: '拼出' })).not.toBeInTheDocument()
  })

  it('展示游客代表与只读拼入价算式；名单空则代表留空（#185）', async () => {
    renderPanel(
      <StatefulPanel initial={{ routeName: '伊犁环线', startDateRange: null }} />,
    )

    await waitFor(() => {
      expect(screen.getByText('900×2')).toBeInTheDocument()
    })

    const tables = screen.getAllByRole('table')
    expect(within(tables[0]).getByText('900×2')).toBeInTheDocument()
    expect(within(tables[0]).queryByText('陈志明')).not.toBeInTheDocument()
    expect(within(tables[1]).getByText('1000×2+500×1')).toBeInTheDocument()
    expect(within(tables[1]).getByText('陈志明 13800002211')).toBeInTheDocument()
    expect(within(tables[1]).getByText('3（2大1小）')).toBeInTheDocument()
  })

  it('点击团号进入发团详情，点击客源行进入客源管理路径（#185）', async () => {
    const user = userEvent.setup()
    renderPanel(
      <StatefulPanel initial={{ routeName: '伊犁环线', startDateRange: null }} />,
    )

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'XTB202607150001' })).toBeInTheDocument()
    })

    expect(screen.getByRole('link', { name: 'XTB202607150001' })).toHaveAttribute(
      'href',
      expect.stringContaining('dep-a'),
    )

    await user.click(screen.getByText('1000×2+500×1'))
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
})
