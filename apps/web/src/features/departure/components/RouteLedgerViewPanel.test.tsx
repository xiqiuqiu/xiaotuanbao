import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfigProvider } from 'antd'
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
}

function renderPanel() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <ConfigProvider>
        <RouteLedgerViewPanel onSwitchToDepartureList={vi.fn()} />
      </ConfigProvider>
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

  it('未选路线时显示空态，提示须先选线路', async () => {
    renderPanel()

    await waitFor(() => {
      expect(listDepartureRouteNames).toHaveBeenCalled()
    })

    expect(screen.getByText('请先选择路线名称')).toBeInTheDocument()
    expect(screen.getByText(/线路视图需先选定一条路线/)).toBeInTheDocument()
    expect(getDepartureRouteLedger).not.toHaveBeenCalled()
  })

  it('选定路线后按日→发团→客源渲染只读表，同日多团边界清晰', async () => {
    const user = userEvent.setup()
    renderPanel()
    await selectRoute(user)

    expect(screen.getByText('2026-07-15')).toBeInTheDocument()
    expect(screen.getByText(/XTB202607150001/)).toBeInTheDocument()
    expect(screen.getByText(/XTB202607150002/)).toBeInTheDocument()

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
    // 只读：表格内无数字步进器/行内金额输入（筛选 Select 的搜索框不计入）
    const tables = screen.getAllByRole('table')
    expect(tables).toHaveLength(2)
    for (const table of tables) {
      expect(within(table).queryByRole('spinbutton')).not.toBeInTheDocument()
      expect(within(table).queryByRole('textbox')).not.toBeInTheDocument()
    }
    expect(within(tables[0]).getByText('同日团 A')).toBeInTheDocument()
    expect(within(tables[1]).getByText('同日团 B')).toBeInTheDocument()
  })

  it('日/发团标题展示拼出汇总：单拼出写清承接方，多拼出列表呈现，不进客源列', async () => {
    const user = userEvent.setup()
    renderPanel()
    await selectRoute(user)

    // 多拼出：列表 + 合计
    expect(screen.getAllByText(/拼出 2 项 · 合计/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/伊犁拼出社/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/那拉提拼出社/).length).toBeGreaterThan(0)

    // 单拼出常见路径
    expect(screen.getByText(/拼出 · 独库拼出社/)).toBeInTheDocument()

    // 客源表无拼出列
    expect(screen.queryByRole('columnheader', { name: '拼出' })).not.toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: '拼出价' })).not.toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: '拼出合计' })).not.toBeInTheDocument()
  })

  it('展示游客代表与只读拼入价算式；名单空则代表留空（#185）', async () => {
    const user = userEvent.setup()
    renderPanel()
    await selectRoute(user)

    const tables = screen.getAllByRole('table')
    expect(within(tables[0]).getByText('900×2')).toBeInTheDocument()
    expect(within(tables[0]).queryByText('陈志明')).not.toBeInTheDocument()

    expect(within(tables[1]).getByText('1000×2+500×1')).toBeInTheDocument()
    expect(within(tables[1]).getByText('陈志明 13800002211')).toBeInTheDocument()
    expect(within(tables[1]).getByText('3（2大1小）')).toBeInTheDocument()
  })

  it('点击团号进入发团详情，点击客源行进入客源管理路径（#185）', async () => {
    const user = userEvent.setup()
    renderPanel()
    await selectRoute(user)

    expect(screen.getByRole('link', { name: 'XTB202607150001' })).toHaveAttribute(
      'href',
      expect.stringContaining('dep-a'),
    )

    await user.click(screen.getByText('1000×2+500×1'))
    expect(navigate).toHaveBeenCalledWith({
      to: '/departure/$departureId',
      params: { departureId: 'dep-b' },
      search: { tab: 'sourceOrders' },
    })
  })
})
