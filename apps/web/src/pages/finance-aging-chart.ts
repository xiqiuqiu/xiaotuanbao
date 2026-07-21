import { formatCents } from '@/features/finance/catalog'

/** 最大档 ≥ 次大档该倍数时，默认改占比列表（用户仍可手动切回柱状）。 */
export const AGING_EXTREME_SPREAD_RATIO = 10

export type FinanceAgingViewMode = 'column' | 'share'

export const FINANCE_AGING_VIEW_MODE_OPTIONS: Array<{
  label: string
  value: FinanceAgingViewMode
}> = [
  { label: '金额对比', value: 'column' },
  { label: '结构占比', value: 'share' },
]

export type FinanceAgingChartBucketInput = {
  label: string
  scheduleCount: number
  unsettledAmountCents: number
}

export type FinanceAgingChartRow = {
  label: string
  unsettledAmountYuan: number
  scheduleCount: number
  amountLabel: string
  countLabel: string
  /** 占逾期未收总额的百分比（0–100）。 */
  sharePercent: number
  shareLabel: string
}

/**
 * 逾期应收账龄展示规格。
 * - suggestedMode：按金额跨度给出的默认视图；界面可用 Segmented 覆盖
 * - column：Ant Design Charts Column 做类别金额对比
 * - share：「金额为主 + 占比条」列表，避免共用纵轴压扁小额档
 */
export type FinanceAgingChartSpec = {
  suggestedMode: FinanceAgingViewMode
  data: FinanceAgingChartRow[]
  xField: 'label'
  yField: 'unsettledAmountYuan'
  scaleYType: 'linear'
}

export function hasExtremeAgingAmountSpread(amountsYuan: number[]): boolean {
  const positive = amountsYuan.filter((value) => value > 0).sort((a, b) => a - b)
  if (positive.length < 2) {
    return false
  }
  const max = positive[positive.length - 1]!
  const second = positive[positive.length - 2]!
  return second > 0 && max >= second * AGING_EXTREME_SPREAD_RATIO
}

function formatShareLabel(sharePercent: number): string {
  if (sharePercent <= 0) {
    return '0%'
  }
  if (sharePercent < 0.1) {
    return '<0.1%'
  }
  if (sharePercent < 1) {
    return `${sharePercent.toFixed(1)}%`
  }
  return `${Math.round(sharePercent)}%`
}

export function buildFinanceAgingChartSpec(
  buckets: FinanceAgingChartBucketInput[],
): FinanceAgingChartSpec {
  const totalCents = buckets.reduce(
    (sum, bucket) => sum + Math.max(bucket.unsettledAmountCents, 0),
    0,
  )

  const data = buckets.map((bucket) => {
    const sharePercent = totalCents > 0
      ? (Math.max(bucket.unsettledAmountCents, 0) / totalCents) * 100
      : 0
    return {
      label: bucket.label,
      unsettledAmountYuan: bucket.unsettledAmountCents / 100,
      scheduleCount: bucket.scheduleCount,
      amountLabel: formatCents(bucket.unsettledAmountCents),
      countLabel: `${bucket.scheduleCount} 个节点`,
      sharePercent,
      shareLabel: formatShareLabel(sharePercent),
    }
  })

  const suggestedMode = hasExtremeAgingAmountSpread(
    data.map((row) => row.unsettledAmountYuan),
  )
    ? 'share'
    : 'column'

  return {
    suggestedMode,
    data,
    xField: 'label',
    yField: 'unsettledAmountYuan',
    scaleYType: 'linear',
  }
}
