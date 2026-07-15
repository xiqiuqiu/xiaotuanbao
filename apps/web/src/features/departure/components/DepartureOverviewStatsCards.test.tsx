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
    discountCents: 200_000,
    netReceivableCents: 1_000_000,
    payableCents: 700_000,
    estimatedMarginCents: 300_000,
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
      confirmedPayableCents: 750_000,
      paidCents: 300_000,
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
      verifiedFromOtherDeparturesCents: 40_000,
      verifiedToOtherDeparturesCents: 10_000,
      anomalies: [],
    },
    isFinanciallySettled: false,
    archiveHistory: [],
    settlementHistory: [],
    ...overrides,
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

  it('窄桌面下资金指标改为纵排，超宽桌面再恢复三列', () => {
    renderCards()

    const cashCard = screen.getByRole('region', { name: '资金情况' })
    const incomeColumn = within(cashCard).getByText('有效收入').closest('.ant-col')

    expect(incomeColumn).toHaveClass('ant-col-sm-8', 'ant-col-lg-24', 'ant-col-xxl-8')
  })

  it('计算公式仅通过文字提示展示', async () => {
    const user = userEvent.setup()
    renderCards()

    const equation = '有效收入 ¥5,000.00 − 有效支出 ¥3,200.00 = 现金净流入 ¥1,800.00'
    expect(screen.queryByText(equation)).not.toBeInTheDocument()

    await user.hover(screen.getByRole('button', { name: '查看资金情况计算方式' }))
    const tooltip = await screen.findByRole('tooltip')
    expect(tooltip).toHaveTextContent(
      '有效收入和有效支出统计本团全部未作废流水，包含已核销与未核销；现金净流入表示实际资金净流动，不代表利润。',
    )
    expect(tooltip).toHaveTextContent(equation)
  })

  it('按三行展示可复算的经营、账款进度与资金数据', async () => {
    const user = userEvent.setup()
    renderCards()

    expect(screen.getByText('总人数')).toBeInTheDocument()
    expect(screen.getByText('原始应收')).toBeInTheDocument()
    expect(screen.getByText('优惠合计')).toBeInTheDocument()
    expect(screen.getByText('实际应收')).toBeInTheDocument()
    expect(screen.getByText('预计成本')).toBeInTheDocument()
    expect(screen.getByText('确认应付')).toBeInTheDocument()
    expect(screen.getByText('预估毛利')).toBeInTheDocument()
    expect(screen.getByText('确认毛利')).toBeInTheDocument()
    expect(screen.queryByText('计调报价 / 财务已确认')).not.toBeInTheDocument()
    expect(screen.queryByText('业务预计 / 财务已确认')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '查看实际应收计算方式' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '查看成本对照计算方式' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '查看毛利对照计算方式' })).toBeInTheDocument()

    expect(screen.getByText('收款进度')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '查看收款进度计算方式' })).toBeInTheDocument()
    const receiptCard = screen.getByRole('region', { name: '收款进度' })
    const receiptDetailsTrigger = within(receiptCard).getByRole('button', {
      name: '查看收款组成',
    })
    expect(receiptDetailsTrigger.closest('.ant-card-extra')).toBeInTheDocument()

    await user.click(receiptDetailsTrigger)
    expect(screen.getByText('尚未生成应收 ¥2,000.00')).toBeInTheDocument()
    expect(screen.getByText('其中已关闭未收 ¥1,000.00')).toBeInTheDocument()
    expect(screen.getByText('其他应收 ¥500.00')).toBeInTheDocument()

    expect(screen.getByText('付款进度')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '查看付款进度计算方式' })).toBeInTheDocument()
    const paymentCard = screen.getByRole('region', { name: '付款进度' })
    const paymentDetailsTrigger = within(paymentCard).getByRole('button', {
      name: '查看付款组成',
    })
    expect(paymentDetailsTrigger.closest('.ant-card-extra')).toBeInTheDocument()

    await user.click(paymentDetailsTrigger)
    expect(screen.getByText('其中已关闭未付 ¥1,000.00')).toBeInTheDocument()
    expect(screen.queryByText(/付款进度.*尚未生成应付/)).not.toBeInTheDocument()

    expect(screen.getByText('资金情况')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '查看资金情况计算方式' })).toBeInTheDocument()
    const cashCard = screen.getByRole('region', { name: '资金情况' })
    const cashHintsTrigger = within(cashCard).getByRole('button', { name: '查看资金提示' })
    expect(cashHintsTrigger.closest('.ant-card-extra')).toBeInTheDocument()
    expect(within(cashCard).queryByRole('button', { name: '查看资金提示' })).toBe(
      cashHintsTrigger,
    )

    await user.click(cashHintsTrigger)
    expect(screen.getByText('未核销收入 ¥1,000.00')).toBeInTheDocument()
    expect(screen.getByText('未核销支出 ¥200.00')).toBeInTheDocument()
    expect(screen.getByText('核销自他团流水 ¥400.00')).toBeInTheDocument()
    expect(screen.getByText('本团流水核销至他团 ¥100.00')).toBeInTheDocument()

    expect(screen.queryByText('应付合计')).not.toBeInTheDocument()
    expect(screen.queryByText(/已核销应收|未结清应收/)).not.toBeInTheDocument()
  })

  it('独立展示成本差异组成，并隐藏零值提示', async () => {
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

    const costCard = screen.getByText('成本对照').closest('.ant-card')
    expect(costCard).not.toBeNull()
    const costDetailsTrigger = within(costCard as HTMLElement).getByRole('button', {
      name: '查看成本组成',
    })
    expect(costDetailsTrigger.closest('.ant-card-extra')).toBeInTheDocument()

    await user.click(costDetailsTrigger)
    expect(screen.getByText('尚未生成应付 ¥800.00')).toBeInTheDocument()
    expect(screen.getByText('其他应付 -¥1,000.00')).toBeInTheDocument()
    expect(screen.queryByText(/^资源账款差异 ¥/)).not.toBeInTheDocument()
  })

  it('分母为零时显示短横，不把无账可收付显示为 0%', () => {
    renderCards(
      makeDeparture({
        netReceivableCents: 0,
        overviewStats: {
          ...makeDeparture().overviewStats,
          receivedCents: 0,
          openUnreceivedCents: 0,
          closedUnreceivedCents: 0,
          ungeneratedReceivableCents: 0,
          confirmedPayableCents: 0,
          paidCents: 0,
          openUnpaidCents: 0,
          closedUnpaidCents: 0,
        },
      }),
    )

    const receiptCard = screen.getByRole('region', { name: '收款进度' })
    const paymentCard = screen.getByRole('region', { name: '付款进度' })
    expect(within(receiptCard).getByText('—')).toBeInTheDocument()
    expect(within(paymentCard).getByText('—')).toBeInTheDocument()
    expect(within(receiptCard).queryByText('0%')).not.toBeInTheDocument()
    expect(within(paymentCard).queryByText('0%')).not.toBeInTheDocument()
  })

  it('文字展示真实超额百分比，进度条视觉封顶 100%', () => {
    renderCards(
      makeDeparture({
        netReceivableCents: 800_000,
        overviewStats: {
          ...makeDeparture().overviewStats,
          receivedCents: 1_000_000,
          openUnreceivedCents: -200_000,
          closedUnreceivedCents: 0,
          ungeneratedReceivableCents: 0,
        },
      }),
    )

    const receiptCard = screen.getByRole('region', { name: '收款进度' })
    expect(within(receiptCard).getByText('125%')).toBeInTheDocument()
    expect(within(receiptCard).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
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

    const receiptCard = screen.getByRole('region', { name: '收款进度（数据异常）' })
    expect(within(receiptCard).getByText('收款守恒异常')).toBeInTheDocument()
    expect(within(receiptCard).getByText('组成合计 ¥11,000.00，应为 ¥10,000.00，差额 ¥1,000.00')).toBeInTheDocument()
    expect(screen.getByText('资金情况')).toBeInTheDocument()
  })
})
