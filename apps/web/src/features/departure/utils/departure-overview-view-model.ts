import type { DepartureDetail, DepartureOverviewAnomaly } from '@xiaotuanbao/shared'

/** 分母为零返回 null（展示「暂无数据」）；否则固定 1 位小数，保留负数与超 100% 真实值。 */
export function formatOverviewPercent(numerator: number, denominator: number): string | null {
  if (denominator === 0) {
    return null
  }
  return `${((numerator / denominator) * 100).toFixed(1)}%`
}

export type OverviewTodoTab = 'sourceOrders' | 'execution' | 'receivables' | 'payables'

export type OverviewTodo = {
  key: string
  label: string
  tab: OverviewTodoTab
  count: number
  detail: string
}

export type DepartureOverviewViewModel = {
  departureId: string
  todos: OverviewTodo[]
  income: {
    grossReceivableCents: number
    discountCents: number
    fareAdjustmentNetCents: number
    settlementReceivableCents: number
    additionalGrossCents: number
    additionalExpenseCents: number
    additionalNetCents: number
    revenueTotalCents: number
  }
  cost: {
    resourceCostCents: number
    outsourceCostCents: number
    costTotalCents: number
  }
  margin: {
    currentMarginCents: number
    marginRate: string | null
  }
  collection: {
    totalCents: number
    receivedCents: number
    unreceivedCents: number
    progress: string | null
    hints: { label: string; amountCents: number }[]
  }
  payment: {
    totalCents: number
    paidCents: number
    unpaidCents: number
    progress: string | null
  }
  receivableAnomaly: DepartureOverviewAnomaly | undefined
}

/** 从 DepartureDetail + overviewStats 构建 B 款概览 view model（ADR-0038）。 */
export function buildDepartureOverviewViewModel(
  departure: DepartureDetail,
): DepartureOverviewViewModel {
  const stats = departure.overviewStats
  const settlementReceivableCents = departure.netReceivableCents
  const additionalNetCents = stats.additionalIncomeNetCents
  const revenueTotalCents = settlementReceivableCents + additionalNetCents
  const costTotalCents = departure.payableCents
  const currentMarginCents = revenueTotalCents - costTotalCents
  const marginRate = formatOverviewPercent(currentMarginCents, revenueTotalCents)

  const receivableTotalCents =
    departure.verifiedReceivableCents +
    departure.openUnsettledReceivableCents +
    stats.closedUnreceivedCents
  const receivableReceivedCents = departure.verifiedReceivableCents
  const receivableUnreceivedCents = receivableTotalCents - receivableReceivedCents

  const collectionHints = [
    stats.customerTopUpCents > 0
      ? { label: '客户待补款', amountCents: stats.customerTopUpCents }
      : null,
    stats.rebateUnpaidCents > 0
      ? { label: '待返客户', amountCents: stats.rebateUnpaidCents }
      : null,
  ].filter((item): item is { label: string; amountCents: number } => item != null)

  const todos: OverviewTodo[] = [
    {
      key: 'guest-list',
      label: '客名单待完善',
      tab: 'sourceOrders',
      count: stats.guestListMissing,
      detail:
        stats.guestListPlanned === 0
          ? '暂无客源'
          : `${stats.guestListRecorded}/${stats.guestListPlanned}，缺少${stats.guestListMissing}人`,
    },
    {
      key: 'pending-receivable',
      label: '待提交应收',
      tab: 'sourceOrders',
      count: stats.pendingReceivableCount,
      detail: `${stats.pendingReceivableCount} 条`,
    },
    {
      key: 'pending-payable',
      label: '待提交应付',
      tab: 'execution',
      count: stats.pendingPayableCount,
      detail: `${stats.pendingPayableCount} 条`,
    },
    {
      key: 'unassigned-resource',
      label: '未安排资源',
      tab: 'execution',
      count: stats.unassignedSegmentCount,
      detail: `${stats.unassignedSegmentCount} 段`,
    },
    {
      key: 'overdue',
      label: '逾期账款',
      tab: 'receivables',
      count: stats.overdueAccountCount,
      detail: `${stats.overdueAccountCount} 笔`,
    },
  ]

  return {
    departureId: departure.id,
    todos: [...todos].sort((a, b) => Number(b.count > 0) - Number(a.count > 0)),
    income: {
      grossReceivableCents: departure.grossReceivableCents,
      discountCents: departure.discountCents,
      fareAdjustmentNetCents: departure.fareAdjustmentNetCents,
      settlementReceivableCents,
      additionalGrossCents: stats.additionalIncomeGrossCents,
      additionalExpenseCents: stats.additionalIncomeExpenseCents,
      additionalNetCents,
      revenueTotalCents,
    },
    cost: {
      resourceCostCents: stats.resourceCostCents,
      outsourceCostCents: stats.outsourceCostCents,
      costTotalCents,
    },
    margin: {
      currentMarginCents,
      marginRate,
    },
    collection: {
      totalCents: receivableTotalCents,
      receivedCents: receivableReceivedCents,
      unreceivedCents: receivableUnreceivedCents,
      progress: formatOverviewPercent(receivableReceivedCents, receivableTotalCents),
      hints: collectionHints,
    },
    payment: {
      totalCents: costTotalCents,
      paidCents: stats.resourcePaidCents,
      unpaidCents: costTotalCents - stats.resourcePaidCents,
      progress: formatOverviewPercent(stats.resourcePaidCents, costTotalCents),
    },
    receivableAnomaly: stats.anomalies.find(({ code }) => code === 'receivable_balance'),
  }
}
