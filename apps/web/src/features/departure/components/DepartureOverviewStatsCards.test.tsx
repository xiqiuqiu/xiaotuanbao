import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DepartureType } from '@xiaotuanbao/shared'
import type { DepartureDetail } from '@/types/api'
import { DepartureOverviewStatsCards } from './DepartureOverviewStatsCards'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    params,
    search,
  }: {
    children: React.ReactNode
    to: string
    params?: Record<string, string>
    search?: Record<string, string>
  }) => {
    const path = Object.entries(params ?? {}).reduce(
      (current, [key, value]) => current.replace(`$${key}`, value),
      to,
    )
    const query = new URLSearchParams(search).toString()
    return (
      <a href={query ? `${path}?${query}` : path} data-testid="overview-todo-link">
        {children}
      </a>
    )
  },
}))

function makeDeparture(overrides: Partial<DepartureDetail> = {}): DepartureDetail {
  const baseStats = {
    receivedCents: 400_000,
    openUnreceivedCents: 500_000,
    closedUnreceivedCents: 100_000,
    ungeneratedReceivableCents: 200_000,
    otherReceivableCents: 50_000,
    additionalIncomeNetCents: 30_000,
    additionalIncomeGrossCents: 50_000,
    additionalIncomeExpenseCents: 20_000,
    settlementCollectionReceivedCents: 400_000,
    settlementCollectionReceivableCents: 1_000_000,
    guestCollectionReceivedCents: 400_000,
    guestCollectionAgreedCents: 1_000_000,
    estimatedRebateCents: 0,
    confirmedRebateCents: 0,
    rebatePaidCents: 0,
    rebateUnpaidCents: 60_000,
    customerTopUpCents: 80_000,
    guestListRecorded: 10,
    guestListPlanned: 12,
    guestListMissing: 2,
    pendingReceivableCount: 1,
    pendingPayableCount: 0,
    unassignedSegmentCount: 0,
    overdueAccountCount: 3,
    resourceCostCents: 600_000,
    outsourceCostCents: 100_000,
    confirmedPayableCents: 750_000,
    paidCents: 300_000,
    resourcePaidCents: 210_000,
    openUnpaidCents: 350_000,
    closedUnpaidCents: 100_000,
    ungeneratedPayableCents: 80_000,
    otherPayableCents: 100_000,
    resourcePayableDifferenceCents: 30_000,
    confirmedMarginCents: 250_000,
    incomeTransactionCents: 500_000,
    expenseTransactionCents: 320_000,
    cashNetInflowCents: 180_000,
    unverifiedIncomeCents: 100_000,
    unverifiedExpenseCents: 20_000,
    verifiedFromExternalCents: 40_000,
    verifiedToOtherDeparturesCents: 10_000,
    anomalies: [] as DepartureDetail['overviewStats']['anomalies'],
  }

  const base: DepartureDetail = {
    id: 'departure-88',
    departureNo: 'XTB2026070088',
    name: '摘要拆分测试团',
    routeName: '测试线',
    routeSource: 'manual',
    sourceTemplateId: null,
    departureType: DepartureType.COMBINED,
    startDate: '2026-08-01',
    endDate: '2026-08-10',
    dayCount: 10,
    ownerUserId: 'user-1',
    status: 'pending_settlement',
    departureProgress: 'not_started',
    notes: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    totalGuests: 12,
    sourceOrderCount: 1,
    segmentCount: 1,
    resourceCount: 1,
    completionTags: {
      sourceOrders: '客源1单',
      segments: '行程1段',
      resources: '资源1项',
      receivables: '应收已提交',
      payables: '应付已提交',
    },
    grossReceivableCents: 1_200_000,
    fareAdjustmentNetCents: 50_000,
    discountCents: 200_000,
    netReceivableCents: 1_000_000,
    payableCents: 700_000,
    // 收入合计 1_030_000 − 成本 700_000
    estimatedMarginCents: 330_000,
    canPurge: false,
    verifiedReceivableCents: 400_000,
    openUnsettledReceivableCents: 500_000,
    verifiedPayableCents: 0,
    openUnsettledPayableCents: 1_000_000,
    unverifiedIncomeCents: 0,
    unverifiedExpenseCents: 0,
    overviewStats: baseStats,
    isFinanciallySettled: false,
    archiveHistory: [],
    settlementHistory: [],
    ...overrides,
  }

  return {
    ...base,
    overviewStats: {
      ...baseStats,
      ...overrides.overviewStats,
    },
  }
}

function renderCards(departure = makeDeparture()) {
  return render(
    <ConfigProvider locale={zhCN}>
      <DepartureOverviewStatsCards departure={departure} />
    </ConfigProvider>,
  )
}

describe('DepartureOverviewStatsCards', () => {
  afterEach(cleanup)

  it('渲染待办提醒、经营概况与收付款进度三块，不展示旧四层结构', () => {
    renderCards()

    expect(screen.getByRole('heading', { name: '待办提醒' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '经营概况' })).toBeInTheDocument()
    expect(screen.getByText('收付款进度')).toBeInTheDocument()

    expect(screen.queryByText('总人数')).not.toBeInTheDocument()
    expect(screen.queryByText('团款收款进度')).not.toBeInTheDocument()
    expect(screen.queryByText('游客代收进度')).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: '返利' })).not.toBeInTheDocument()
    expect(screen.queryByText('现金净流入')).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: '现金' })).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: '经营构成' })).not.toBeInTheDocument()
    expect(screen.queryByText('结算收入')).not.toBeInTheDocument()
  })

  it('经营横条展示五项指标，当前毛利带毛利率，毛利率分母为收入合计', () => {
    renderCards()

    const settlementCell = screen.getByText('结算应收').closest('div')
    expect(settlementCell).not.toBeNull()
    const businessCard = screen.getByRole('heading', { name: '经营概况' }).closest('.ant-card')
    expect(businessCard).not.toBeNull()
    const strip = within(businessCard as HTMLElement)

    expect(strip.getByText('结算应收')).toBeInTheDocument()
    expect(strip.getByText('增收净收益')).toBeInTheDocument()
    expect(strip.getByText('收入合计')).toBeInTheDocument()
    expect(strip.getByText('成本合计')).toBeInTheDocument()
    expect(strip.getByText('当前毛利')).toBeInTheDocument()

    // 结算应收在横条；收款摘要也有同额，用毛利/收入合计等唯一值锚定
    expect(strip.getByText('¥300.00')).toBeInTheDocument()
    expect(strip.getByText('¥10,300.00')).toBeInTheDocument()
    expect(strip.getByText('¥3,300.00')).toBeInTheDocument()
    // 330000 / 1030000 ≈ 32.0%
    expect(strip.getByText('毛利率 32.0%')).toBeInTheDocument()
  })

  it('收入合计为零时毛利率不展示；负毛利保留真实负比例', () => {
    renderCards(
      makeDeparture({
        netReceivableCents: 0,
        estimatedMarginCents: 0,
        overviewStats: {
          ...makeDeparture().overviewStats,
          additionalIncomeNetCents: 0,
        },
      }),
    )

    expect(screen.queryByText(/毛利率/)).not.toBeInTheDocument()
    cleanup()

    renderCards(
      makeDeparture({
        netReceivableCents: 1_000_000,
        payableCents: 1_125_000,
        estimatedMarginCents: -95_000,
        overviewStats: {
          ...makeDeparture().overviewStats,
          additionalIncomeNetCents: 30_000,
        },
      }),
    )
    // 收入合计 1_030_000，毛利 −95_000 → −9.2%
    expect(screen.getByText('毛利率 -9.2%')).toBeInTheDocument()
  })

  it('结算应收与收入合计带 Tooltip 说明', async () => {
    const user = userEvent.setup()
    renderCards()

    await user.hover(screen.getByText('结算应收'))
    expect(await screen.findByText(/客源团款合计，不含团内增收/)).toBeInTheDocument()

    cleanup()
    renderCards()
    await user.hover(screen.getByText('收入合计'))
    expect(await screen.findByText(/结算应收 \+ 增收净收益/)).toBeInTheDocument()
  })

  it('团款/增收/收入/成本 Popover 构成可展开，收入合计含结算应收与增收净收益', async () => {
    const user = userEvent.setup()
    renderCards()

    await user.click(screen.getByRole('button', { name: '查看团款组成' }))
    expect(screen.getByText('原始团款')).toBeInTheDocument()
    expect(screen.getByText('优惠合计')).toBeInTheDocument()
    expect(screen.getByText('团款调整')).toBeInTheDocument()
    expect(screen.getByText('¥12,000.00')).toBeInTheDocument()
    expect(screen.getByText('¥2,000.00')).toBeInTheDocument()
    expect(screen.getByText('¥500.00')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '查看增收组成' }))
    expect(screen.getByText('增收收入')).toBeInTheDocument()
    expect(screen.getByText('增收支出')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '查看收入组成' }))
    const incomePopover = screen.getByText('收入组成').closest('.ant-popover')
    expect(incomePopover).not.toBeNull()
    expect(within(incomePopover as HTMLElement).getByText('结算应收')).toBeInTheDocument()
    expect(within(incomePopover as HTMLElement).getByText('增收净收益')).toBeInTheDocument()
    expect(within(incomePopover as HTMLElement).queryByText('结算收入')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '查看成本组成' }))
    const costPopoverTitle = screen.getByText('成本组成')
    const costPopover = costPopoverTitle.closest('.ant-popover') ?? costPopoverTitle.parentElement
    expect(costPopover).not.toBeNull()
    expect(within(costPopover as HTMLElement).getByText('资源成本')).toBeInTheDocument()
    expect(within(costPopover as HTMLElement).getByText('拼出成本')).toBeInTheDocument()
    expect(within(costPopover as HTMLElement).getByText('¥6,000.00')).toBeInTheDocument()
    expect(within(costPopover as HTMLElement).getByText('¥1,000.00')).toBeInTheDocument()
  })

  it('待办五卡可跳转对应 Tab；有项警告文案、无项显示正常；标题区无数字角标', () => {
    renderCards()

    expect(screen.queryByText(/^5$/)).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '待办提醒' }).closest('.ant-card')).not.toHaveTextContent(
      /\d+\s*$/,
    )

    const links = screen.getAllByTestId('overview-todo-link')
    expect(links).toHaveLength(5)

    expect(screen.getByText('客名单待完善')).toBeInTheDocument()
    expect(screen.getByText('10/12，缺少2人')).toBeInTheDocument()
    expect(screen.getByText('待提交应收')).toBeInTheDocument()
    expect(screen.getByText('1 条')).toBeInTheDocument()
    expect(screen.getByText('待提交应付')).toBeInTheDocument()
    expect(screen.getByText('未安排资源')).toBeInTheDocument()
    expect(screen.getByText('逾期账款')).toBeInTheDocument()
    expect(screen.getByText('3 笔')).toBeInTheDocument()

    // 无问题项显示「正常」
    expect(screen.getAllByText('正常')).toHaveLength(2)

    const hrefs = links.map((link) => link.getAttribute('href'))
    expect(hrefs).toEqual(
      expect.arrayContaining([
        '/departure/departure-88?tab=sourceOrders',
        '/departure/departure-88?tab=execution',
        '/departure/departure-88?tab=receivables',
      ]),
    )
  })

  it('收款进度按已提交应收口径，付款进度按资源已付÷成本合计，并展示待返客户等提示', () => {
    renderCards()

    const collection = screen.getByRole('region', { name: '收款进度' })
    const payment = screen.getByRole('region', { name: '付款进度' })

    // 已核销 400000 ÷ 已提交应收合计 1000000
    expect(within(collection).getByText('40.0%')).toBeInTheDocument()
    expect(within(collection).getByText('应收')).toBeInTheDocument()
    expect(within(collection).getByText('已收')).toBeInTheDocument()
    expect(within(collection).getByText('未收')).toBeInTheDocument()
    expect(within(collection).getByText('¥10,000.00')).toBeInTheDocument()
    expect(within(collection).getByText('¥4,000.00')).toBeInTheDocument()
    expect(within(collection).getByText('¥6,000.00')).toBeInTheDocument()
    expect(within(collection).getByText('客户待补款')).toBeInTheDocument()
    expect(within(collection).getByText('¥800.00')).toBeInTheDocument()
    expect(within(collection).getByText('待返客户')).toBeInTheDocument()
    expect(within(collection).getByText('¥600.00')).toBeInTheDocument()

    // 资源已付 210000 ÷ 成本合计 700000
    expect(within(payment).getByText('30.0%')).toBeInTheDocument()
    expect(within(payment).getByText('应付')).toBeInTheDocument()
    expect(within(payment).getByText('已付')).toBeInTheDocument()
    expect(within(payment).getByText('未付')).toBeInTheDocument()
    expect(within(payment).getByText('¥7,000.00')).toBeInTheDocument()
    expect(within(payment).getByText('¥2,100.00')).toBeInTheDocument()
    expect(within(payment).getByText('¥4,900.00')).toBeInTheDocument()

    expect(within(collection).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '40')
    expect(within(payment).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '30')
  })

  it('付款进度超过 100% 时保留真实百分比与未付负数', () => {
    renderCards(
      makeDeparture({
        payableCents: 200_000,
        overviewStats: {
          ...makeDeparture().overviewStats,
          resourcePaidCents: 250_000,
        },
      }),
    )

    const payment = screen.getByRole('region', { name: '付款进度' })
    expect(within(payment).getByText('125.0%')).toBeInTheDocument()
    expect(within(payment).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
    expect(within(payment).getByText('-¥500.00')).toBeInTheDocument()
  })

  it('进度分母为零时显示暂无数据', () => {
    renderCards(
      makeDeparture({
        verifiedReceivableCents: 0,
        openUnsettledReceivableCents: 0,
        payableCents: 0,
        overviewStats: {
          ...makeDeparture().overviewStats,
          closedUnreceivedCents: 0,
          resourcePaidCents: 0,
          customerTopUpCents: 0,
          rebateUnpaidCents: 0,
        },
      }),
    )

    const collection = screen.getByRole('region', { name: '收款进度' })
    const payment = screen.getByRole('region', { name: '付款进度' })
    expect(within(collection).getByText('暂无数据')).toBeInTheDocument()
    expect(within(payment).getByText('暂无数据')).toBeInTheDocument()
  })

  it('应收守恒异常不阻止读取，并在收款进度旁提示', () => {
    renderCards(
      makeDeparture({
        overviewStats: {
          ...makeDeparture().overviewStats,
          anomalies: [
            {
              code: 'receivable_balance',
              expectedCents: 1_000_000,
              actualCents: 1_100_000,
              differenceCents: 100_000,
            },
          ],
        },
      }),
    )

    const collection = screen.getByRole('region', { name: '收款进度' })
    expect(within(collection).getByText('应收与结算金额不一致')).toBeInTheDocument()
    expect(
      within(collection).getByText(
        '已提交应收合计 ¥11,000.00，结算金额合计 ¥10,000.00，多出 ¥1,000.00',
      ),
    ).toBeInTheDocument()
  })

  it('ADR-0036：旧「其他收入 / 团上收入」文案不得回退', () => {
    renderCards()
    expect(screen.queryByText('其他收入')).not.toBeInTheDocument()
    expect(screen.queryByText('团上收入')).not.toBeInTheDocument()
  })
})
