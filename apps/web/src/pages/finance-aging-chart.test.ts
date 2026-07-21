import { describe, expect, it } from 'vitest'
import {
  AGING_EXTREME_SPREAD_RATIO,
  buildFinanceAgingChartSpec,
  hasExtremeAgingAmountSpread,
} from './finance-aging-chart'

/** 与工作台展示边界 seed / 用户截图一致的极端账龄分布。 */
const extremeBuckets = [
  { label: '1–7 天', scheduleCount: 5, unsettledAmountCents: 106_000 },
  { label: '8–30 天', scheduleCount: 2, unsettledAmountCents: 380_000 },
  { label: '30 天以上', scheduleCount: 1, unsettledAmountCents: 999_999_900 },
]

const balancedBuckets = [
  { label: '1–7 天', scheduleCount: 1, unsettledAmountCents: 10_000 },
  { label: '8–30 天', scheduleCount: 1, unsettledAmountCents: 25_000 },
  { label: '30 天以上', scheduleCount: 1, unsettledAmountCents: 90_000 },
]

describe('buildFinanceAgingChartSpec', () => {
  it('suggests share list when one bucket dominates (≥10×)', () => {
    const spec = buildFinanceAgingChartSpec(extremeBuckets)

    expect(spec.suggestedMode).toBe('share')
    expect(spec.scaleYType).toBe('linear')
    expect(spec.data[2]?.amountLabel).toBe('¥9,999,999.00')
    expect(spec.data[2]?.sharePercent).toBeGreaterThan(99)
    expect(spec.data[0]?.shareLabel).toBe('<0.1%')
    expect(spec.data.map((row) => row.scheduleCount)).toEqual([5, 2, 1])
  })

  it('suggests Column when amounts are comparable', () => {
    const spec = buildFinanceAgingChartSpec(balancedBuckets)

    expect(spec.suggestedMode).toBe('column')
    expect(spec.yField).toBe('unsettledAmountYuan')
    expect(spec.xField).toBe('label')
    expect(spec.scaleYType).toBe('linear')

    const amounts = spec.data.map((row) => row.unsettledAmountYuan)
    expect(amounts[2]).toBeGreaterThan(amounts[1]!)
    expect(amounts[1]).toBeGreaterThan(amounts[0]!)
  })

  it('keeps exact amount labels and exposes schedule count as secondary text', () => {
    const spec = buildFinanceAgingChartSpec(extremeBuckets)

    expect(spec.data[0]?.amountLabel).toBe('¥1,060.00')
    expect(spec.data[0]?.countLabel).toBe('5 个节点')
    expect(spec.data[2]?.countLabel).toBe('1 个节点')
  })

  it('does not invent a 1-yuan floor for empty buckets (log-scale artifact)', () => {
    const spec = buildFinanceAgingChartSpec([
      { label: '1–7 天', scheduleCount: 0, unsettledAmountCents: 0 },
      { label: '8–30 天', scheduleCount: 1, unsettledAmountCents: 10_000 },
    ])

    expect(spec.data[0]?.unsettledAmountYuan).toBe(0)
    expect(spec.data[0]?.amountLabel).toBe('¥0.00')
    expect(spec.data[0]?.sharePercent).toBe(0)
  })
})

describe('hasExtremeAgingAmountSpread', () => {
  it(`flags spread at ${AGING_EXTREME_SPREAD_RATIO}× and above`, () => {
    expect(hasExtremeAgingAmountSpread([1060, 3800, 9_999_999])).toBe(true)
    expect(hasExtremeAgingAmountSpread([100, 250, 900])).toBe(false)
    expect(hasExtremeAgingAmountSpread([100, 1000])).toBe(true)
    expect(hasExtremeAgingAmountSpread([100, 999])).toBe(false)
  })
})
