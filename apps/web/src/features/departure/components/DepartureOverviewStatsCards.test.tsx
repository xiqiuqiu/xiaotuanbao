import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DepartureType, TransactionDirection } from '@xiaotuanbao/shared'
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
    return (
      <a href={`${path}?${new URLSearchParams(search).toString()}`} data-testid="tx-link">
        {children}
      </a>
    )
  },
}))

function makeDeparture(overrides: Partial<DepartureDetail> = {}): DepartureDetail {
  return {
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
      receivables: '应收已生成',
      payables: '应付已生成',
    },
    grossReceivableCents: 1_200_000,
    fareAdjustmentNetCents: 50_000,
    discountCents: 200_000,
    netReceivableCents: 1_000_000,
    payableCents: 700_000,
    estimatedMarginCents: 300_000,
    canPurge: false,
    verifiedReceivableCents: 0,
    openUnsettledReceivableCents: 1_000_000,
    verifiedPayableCents: 0,
    openUnsettledPayableCents: 1_000_000,
    unverifiedIncomeCents: 0,
    unverifiedExpenseCents: 0,
    overviewStats: {
      receivedCents: 400_000,
      openUnreceivedCents: 300_000,
      closedUnreceivedCents: 100_000,
      ungeneratedReceivableCents: 200_000,
      otherReceivableCents: 50_000,
      otherIncomeCents: 30_000,
      settlementCollectionReceivedCents: 400_000,
      settlementCollectionReceivableCents: 1_000_000,
      guestCollectionReceivedCents: 400_000,
      guestCollectionAgreedCents: 1_000_000,
      estimatedRebateCents: 0,
      confirmedRebateCents: 0,
      rebatePaidCents: 0,
      rebateUnpaidCents: 0,
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
      anomalies: [],
    },
    isFinanciallySettled: false,
    archiveHistory: [],
    settlementHistory: [],
    ...overrides,
  }
}

function renderCards(departure = makeDeparture(), animateEnter = false) {
  return render(
    <ConfigProvider locale={zhCN}>
      <DepartureOverviewStatsCards departure={departure} animateEnter={animateEnter} />
    </ConfigProvider>,
  )
}

describe('DepartureOverviewStatsCards', () => {
  it('shows ground income as an independent Other Income card', () => {
    render(<DepartureOverviewStatsCards departure={makeDeparture()} />)

    expect(screen.getByText('其他收入')).toBeInTheDocument()
    expect(screen.getByText('¥300.00')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '查看其他收入说明' })).toBeInTheDocument()
  })

  afterEach(cleanup)

  it('概览结构包含标题旁说明入口、经营构成单组与资金进度三卡', () => {
    renderCards()

    expect(screen.getByLabelText('查看结算应收说明')).toBeInTheDocument()
    expect(screen.getByLabelText('查看现金净流入说明')).toBeInTheDocument()
    expect(screen.queryByLabelText('查看计算口径')).not.toBeInTheDocument()
    expect(screen.getByRole('group', { name: '经营构成' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: '收款' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: '付款' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: '现金' })).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: '经营补充' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: '资金情况' })).not.toBeInTheDocument()
  })

  it('首次进入时核心结论卡、资金分组卡与进度条挂载入场 class', () => {
    renderCards(makeDeparture(), true)

    const collectionCard = screen.getByRole('region', { name: '收款' })
    const paymentCard = screen.getByRole('region', { name: '付款' })
    const cashCard = screen.getByRole('region', { name: '现金' })
    expect(collectionCard.className).toContain('metricCardEnter')
    expect(paymentCard.className).toContain('metricCardEnter')
    expect(cashCard.className).toContain('metricCardEnter')
    expect(screen.getByText('总人数').closest('.ant-card')?.className).toContain(
      'metricCardEnter',
    )
    expect(screen.getByRole('group', { name: '经营构成' }).className).toContain('metricCardEnter')

    const receiptSection = screen.getByRole('group', { name: '团款收款进度' })
    const paymentSection = screen.getByRole('group', { name: '资源付款' })
    const receiptProgress = within(receiptSection).getByRole('progressbar')
    const paymentProgress = within(paymentSection).getByRole('progressbar')
    expect(receiptProgress.className).toContain('progressLoad')
    expect(paymentProgress.className).toContain('progressLoad')
  })

  it('非首次进入时不挂载卡片入场与进度条揭示 class', () => {
    renderCards(makeDeparture(), false)

    const collectionCard = screen.getByRole('region', { name: '收款' })
    const paymentCard = screen.getByRole('region', { name: '付款' })
    expect(collectionCard.className).not.toContain('metricCardEnter')
    expect(paymentCard.className).not.toContain('metricCardEnter')
    expect(screen.getByText('总人数').closest('.ant-card')?.className).not.toContain(
      'metricCardEnter',
    )
    const receiptSection = screen.getByRole('group', { name: '团款收款进度' })
    const paymentSection = screen.getByRole('group', { name: '资源付款' })
    expect(within(receiptSection).getByRole('progressbar').className).not.toContain('progressLoad')
    expect(within(paymentSection).getByRole('progressbar').className).not.toContain('progressLoad')
  })

  it('初始化加载动效不延迟进度条语义值与百分比文字', () => {
    renderCards(makeDeparture(), true)

    const receiptSection = screen.getByRole('group', { name: '团款收款进度' })
    const paymentSection = screen.getByRole('group', { name: '资源付款' })
    expect(within(receiptSection).getByText('40.0%')).toBeInTheDocument()
    expect(within(paymentSection).getByText('30.0%')).toBeInTheDocument()
    const receiptProgress = within(receiptSection).getByRole('progressbar')
    const paymentProgress = within(paymentSection).getByRole('progressbar')
    expect(receiptProgress).toHaveAttribute('aria-valuenow', '40')
    expect(paymentProgress).toHaveAttribute('aria-valuenow', '30')
    expect(receiptProgress.className).toContain('progressLoad')
    expect(paymentProgress.className).toContain('progressLoad')
  })

  it('主层展示总人数、结算应收、成本合计、当前毛利，不再使用旧口径文案', () => {
    renderCards()

    expect(screen.getByText('总人数')).toBeInTheDocument()
    expect(screen.getByText('结算应收')).toBeInTheDocument()
    expect(screen.getByText('成本合计')).toBeInTheDocument()
    expect(screen.getByText('当前毛利')).toBeInTheDocument()

    expect(screen.queryByText('原始应收')).not.toBeInTheDocument()
    expect(screen.queryByText('实际应收')).not.toBeInTheDocument()
    expect(screen.queryByText('预计成本')).not.toBeInTheDocument()
    expect(screen.queryByText('预估毛利')).not.toBeInTheDocument()
    expect(screen.queryByText('成本对照')).not.toBeInTheDocument()
    expect(screen.queryByText('毛利对照')).not.toBeInTheDocument()
    expect(screen.queryByText('应付合计')).not.toBeInTheDocument()
  })

  it('经营构成展示原始团款、优惠合计与 1 位小数毛利率，不单独展示调整净额', () => {
    renderCards()

    const compositionGroup = screen.getByRole('group', { name: '经营构成' })
    const summaryRowsStack = compositionGroup.closest('.ant-space')
    expect(summaryRowsStack).toHaveClass('ant-space-vertical')
    expect(summaryRowsStack).toHaveStyle({ rowGap: '16px' })
    expect(within(compositionGroup).getByText('原始团款')).toBeInTheDocument()
    expect(within(compositionGroup).getByText('优惠合计')).toBeInTheDocument()
    expect(within(compositionGroup).getByText('毛利率')).toBeInTheDocument()
    expect(within(compositionGroup).queryByText('调整净额')).not.toBeInTheDocument()
    expect(within(compositionGroup).getByText('¥12,000.00')).toBeInTheDocument()
    expect(within(compositionGroup).getByText('¥2,000.00')).toBeInTheDocument()
    expect(within(compositionGroup).getByText('30.0%')).toBeInTheDocument()
  })

  it('结算应收说明公式含调整净额', async () => {
    const user = userEvent.setup()
    renderCards()

    await user.hover(screen.getByLabelText('查看结算应收说明'))
    expect(
      await screen.findByText(/原始团款合计 \+ 调整净额 − 优惠合计/),
    ).toBeInTheDocument()
  })

  it('毛利率分母为零显示暂无数据，负毛利保留真实负比例', () => {
    renderCards(makeDeparture({ netReceivableCents: 0, estimatedMarginCents: 0 }))
    expect(screen.getAllByText('暂无数据').length).toBeGreaterThan(0)
    cleanup()

    renderCards(makeDeparture({ estimatedMarginCents: -125_000 }))
    expect(screen.getByText('-12.5%')).toBeInTheDocument()
  })

  it('明细入口是右上角图标按钮，不再渲染蓝色文字链接', () => {
    renderCards()

    // 可访问名保留「查看…」语义，但不再以文字形式出现在卡面上。
    expect(screen.getByRole('button', { name: '查看成本组成' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '查看毛利对照' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '查看收款组成' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '查看付款组成' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '查看资金提示' })).toBeInTheDocument()

    expect(screen.queryByText('查看成本组成')).not.toBeInTheDocument()
    expect(screen.queryByText('查看毛利对照')).not.toBeInTheDocument()
    expect(screen.queryByText('查看收款组成')).not.toBeInTheDocument()
    expect(screen.queryByText('查看付款组成')).not.toBeInTheDocument()
    expect(screen.queryByText('查看资金提示')).not.toBeInTheDocument()
  })

  it('成本合计入口就近解释确认应付、尚未生成应付、其他应付与资源账款差异', async () => {
    const user = userEvent.setup()
    renderCards()

    const costCard = screen.getByText('成本合计').closest('.ant-card')
    expect(costCard).not.toBeNull()
    await user.click(
      within(costCard as HTMLElement).getByRole('button', { name: '查看成本组成' }),
    )

    expect(screen.getByText('确认应付 ¥7,500.00')).toBeInTheDocument()
    expect(screen.getByText('尚未生成应付 ¥800.00')).toBeInTheDocument()
    expect(screen.getByText('其他应付 ¥1,000.00')).toBeInTheDocument()
    expect(screen.getByText('资源账款差异 ¥300.00')).toBeInTheDocument()
  })

  it('成本组成隐藏零值提示，保留有符号金额', async () => {
    const user = userEvent.setup()
    renderCards(
      makeDeparture({
        overviewStats: {
          ...makeDeparture().overviewStats,
          otherPayableCents: -100_000,
          resourcePayableDifferenceCents: 0,
        },
      }),
    )

    const costCard = screen.getByText('成本合计').closest('.ant-card')
    await user.click(
      within(costCard as HTMLElement).getByRole('button', { name: '查看成本组成' }),
    )

    expect(screen.getByText('其他应付 -¥1,000.00')).toBeInTheDocument()
    expect(screen.queryByText(/^资源账款差异/)).not.toBeInTheDocument()
  })

  it('当前毛利入口对照确认毛利', async () => {
    const user = userEvent.setup()
    renderCards()

    const marginCard = screen.getByText('当前毛利').closest('.ant-card')
    expect(marginCard).not.toBeNull()
    await user.click(
      within(marginCard as HTMLElement).getByRole('button', { name: '查看毛利对照' }),
    )

    expect(screen.getByText('确认毛利 ¥2,500.00')).toBeInTheDocument()
  })

  it('进度卡面直接展示团款/代收已收未收与付款已付未付', () => {
    renderCards()

    // 团款已收 400000 + 未收 600000 = 结算金额 1000000
    const receiptSection = screen.getByRole('group', { name: '团款收款进度' })
    expect(within(receiptSection).getByText('已收')).toBeInTheDocument()
    expect(within(receiptSection).getByText('¥4,000.00')).toBeInTheDocument()
    expect(within(receiptSection).getByText('未收')).toBeInTheDocument()
    expect(within(receiptSection).getByText('¥6,000.00')).toBeInTheDocument()

    const guestSection = screen.getByRole('group', { name: '游客代收进度' })
    expect(within(guestSection).getByText('40.0%')).toBeInTheDocument()

    // 已付（资源应付已核销）210000 + 未付 490000 = 成本合计 700000
    const paymentSection = screen.getByRole('group', { name: '资源付款' })
    expect(within(paymentSection).getByText('已付')).toBeInTheDocument()
    expect(within(paymentSection).getByText('¥2,100.00')).toBeInTheDocument()
    expect(within(paymentSection).getByText('未付')).toBeInTheDocument()
    expect(within(paymentSection).getByText('¥4,900.00')).toBeInTheDocument()
  })

  it('付款进度超过 100% 时未付展示真实负数金额，不归零', () => {
    renderCards(
      makeDeparture({
        payableCents: 200_000,
        overviewStats: {
          ...makeDeparture().overviewStats,
          resourcePaidCents: 250_000,
        },
      }),
    )

    const paymentSection = screen.getByRole('group', { name: '资源付款' })
    expect(within(paymentSection).getByText('-¥500.00')).toBeInTheDocument()
  })

  it('团款收款进度按团款已收÷结算金额，并保留收款组成入口', async () => {
    const user = userEvent.setup()
    renderCards()

    const receiptSection = screen.getByRole('group', { name: '团款收款进度' })
    expect(within(receiptSection).getByText('40.0%')).toBeInTheDocument()

    await user.click(
      within(receiptSection).getByRole('button', { name: '查看收款组成' }),
    )
    expect(screen.getByText('尚未生成应收 ¥2,000.00')).toBeInTheDocument()
    expect(screen.getByText('其中已关闭未收 ¥1,000.00')).toBeInTheDocument()
    expect(screen.getByText('其他应收 ¥500.00')).toBeInTheDocument()
  })

  it('返利卡展示预估与已确认应付/已付/未付', () => {
    renderCards(
      makeDeparture({
        overviewStats: {
          ...makeDeparture().overviewStats,
          estimatedRebateCents: 100_000,
          confirmedRebateCents: 100_000,
          rebatePaidCents: 40_000,
          rebateUnpaidCents: 60_000,
        },
      }),
    )

    const rebateSection = screen.getByRole('group', { name: '返利' })
    expect(within(rebateSection).getByText('预估')).toBeInTheDocument()
    expect(within(rebateSection).getByText('已确认')).toBeInTheDocument()
    expect(within(rebateSection).getByText('已付')).toBeInTheDocument()
    expect(within(rebateSection).getByText('未付')).toBeInTheDocument()
    expect(within(rebateSection).getAllByText('¥1,000.00')).toHaveLength(2)
    expect(within(rebateSection).getByText('¥400.00')).toBeInTheDocument()
    expect(within(rebateSection).getByText('¥600.00')).toBeInTheDocument()
  })

  it('付款进度按资源应付已核销÷成本合计，明细保留全部应付核销进度与已关闭未付', async () => {
    const user = userEvent.setup()
    renderCards()

    const paymentSection = screen.getByRole('group', { name: '资源付款' })
    // 资源应付已核销 210000 ÷ 成本合计 700000，而非全部已付 300000 ÷ 确认应付 750000。
    expect(within(paymentSection).getByText('30.0%')).toBeInTheDocument()
    expect(within(paymentSection).queryByText('40.0%')).not.toBeInTheDocument()

    await user.click(
      within(paymentSection).getByRole('button', { name: '查看付款组成' }),
    )
    expect(
      screen.getByText('全部应付核销进度 40.0%（全部已付 ¥3,000.00 ÷ 确认应付 ¥7,500.00）'),
    ).toBeInTheDocument()
    expect(screen.getByText('其中已关闭未付 ¥1,000.00')).toBeInTheDocument()
  })

  it('资源账款差异使付款进度合法超过 100%，文字保留真实值', () => {
    renderCards(
      makeDeparture({
        payableCents: 200_000,
        overviewStats: {
          ...makeDeparture().overviewStats,
          resourcePaidCents: 250_000,
        },
      }),
    )

    const paymentSection = screen.getByRole('group', { name: '资源付款' })
    expect(within(paymentSection).getByText('125.0%')).toBeInTheDocument()
    expect(within(paymentSection).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
  })

  it('存在尚未生成应付时付款进度以成本合计为分母而系统性偏低', () => {
    // 已生成资源 400000 全部核销，但成本合计还含尚未生成应付 300000。
    renderCards(
      makeDeparture({
        payableCents: 700_000,
        overviewStats: {
          ...makeDeparture().overviewStats,
          resourcePaidCents: 400_000,
          ungeneratedPayableCents: 300_000,
        },
      }),
    )

    const paymentSection = screen.getByRole('group', { name: '资源付款' })
    expect(within(paymentSection).getByText('57.1%')).toBeInTheDocument()
    expect(within(paymentSection).queryByText('100.0%')).not.toBeInTheDocument()
  })

  it('进度分母为零时显示暂无数据，不显示 0% 或短横', () => {
    renderCards(
      makeDeparture({
        netReceivableCents: 0,
        payableCents: 0,
        estimatedMarginCents: 0,
        overviewStats: {
          ...makeDeparture().overviewStats,
          receivedCents: 0,
          openUnreceivedCents: 0,
          closedUnreceivedCents: 0,
          ungeneratedReceivableCents: 0,
          settlementCollectionReceivedCents: 0,
          settlementCollectionReceivableCents: 0,
          guestCollectionReceivedCents: 0,
          guestCollectionAgreedCents: 0,
          resourcePaidCents: 0,
        },
      }),
    )

    const receiptSection = screen.getByRole('group', { name: '团款收款进度' })
    const guestSection = screen.getByRole('group', { name: '游客代收进度' })
    const paymentSection = screen.getByRole('group', { name: '资源付款' })
    expect(within(receiptSection).getByText('暂无数据')).toBeInTheDocument()
    expect(within(guestSection).getByText('暂无数据')).toBeInTheDocument()
    expect(within(paymentSection).getByText('暂无数据')).toBeInTheDocument()
    expect(within(receiptSection).queryByText(/0\.0%|—/)).not.toBeInTheDocument()
    expect(within(paymentSection).queryByText(/0\.0%|—/)).not.toBeInTheDocument()
  })

  it('代收溢价不抬高团款进度：Guest 已收≥S 时团款为 100%', () => {
    renderCards(
      makeDeparture({
        netReceivableCents: 500_000,
        overviewStats: {
          ...makeDeparture().overviewStats,
          settlementCollectionReceivedCents: 500_000,
          settlementCollectionReceivableCents: 500_000,
          guestCollectionReceivedCents: 600_000,
          guestCollectionAgreedCents: 600_000,
          estimatedRebateCents: 100_000,
        },
      }),
    )

    const receiptSection = screen.getByRole('group', { name: '团款收款进度' })
    const guestSection = screen.getByRole('group', { name: '游客代收进度' })
    expect(within(receiptSection).getByText('100.0%')).toBeInTheDocument()
    expect(within(guestSection).getByText('100.0%')).toBeInTheDocument()
    expect(within(receiptSection).queryByText('120.0%')).not.toBeInTheDocument()
  })

  it('现金区域突出现金净流入，并将收入支出降为辅助信息', () => {
    renderCards()

    const cashCard = screen.getByRole('region', { name: '现金' })
    const cashNetStatistic = within(cashCard).getByText('现金净流入').closest('.ant-statistic')
    const breakdown = within(cashCard).getByRole('group', { name: '资金收支明细' })

    expect(cashNetStatistic).not.toBeNull()
    expect(within(breakdown).getByText('有效收入')).toBeInTheDocument()
    expect(within(breakdown).getByText('有效支出')).toBeInTheDocument()
  })

  it('资金提示展示未核销收支与外部核销差值', async () => {
    const user = userEvent.setup()
    renderCards()

    const cashCard = screen.getByRole('region', { name: '现金' })
    await user.click(within(cashCard).getByRole('button', { name: '查看资金提示' }))

    expect(screen.getByText('未核销收入 ¥1,000.00')).toBeInTheDocument()
    expect(screen.getByText('未核销支出 ¥200.00')).toBeInTheDocument()
    expect(screen.getByText('核销自外部流水 ¥400.00')).toBeInTheDocument()
    expect(screen.getByText('本团流水核销至他团 ¥100.00')).toBeInTheDocument()
    expect(screen.queryByText(/核销自他团流水/)).not.toBeInTheDocument()
  })

  it('说明提示仅展示算法文案，不再展示含金额的计算方式', async () => {
    const user = userEvent.setup()
    renderCards()

    const equation = '有效收入 ¥5,000.00 − 有效支出 ¥3,200.00 = 现金净流入 ¥1,800.00'
    expect(screen.queryByText(equation)).not.toBeInTheDocument()

    await user.hover(screen.getByLabelText('查看现金净流入说明'))
    const guideTooltip = await screen.findByRole('tooltip')
    expect(guideTooltip).toHaveTextContent(
      /本团当前实际发生的资金收支情况。计算：现金净流入 = 有效收入 − 有效支出。根据已关联本团的未作废收支流水实时统计。/,
    )
    expect(screen.queryByText(equation)).not.toBeInTheDocument()
  })

  it('守恒异常不阻止读取，并在对应卡片展示原始差额', () => {
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

    const receiptSection = screen.getByRole('group', { name: '团款收款进度（数据异常）' })
    expect(within(receiptSection).getByText('收款守恒异常')).toBeInTheDocument()
    expect(
      within(receiptSection).getByText('组成合计 ¥11,000.00，应为 ¥10,000.00，差额 ¥1,000.00'),
    ).toBeInTheDocument()
    expect(screen.getByText('现金')).toBeInTheDocument()
  })
})
