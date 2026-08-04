/** 线路视图导出合计行拼入价：按人数加权平均单价（元）；该侧人数为 0 时显示 -。 */
type UnitPriceRow = {
  adultGuestCount: number
  childGuestCount: number
  adultUnitPriceCents: number
  childUnitPriceCents: number
}

function formatFormulaYuan(cents: number): string {
  return String(cents / 100)
}

export function summarizeRouteLedgerUnitPrices(rows: readonly UnitPriceRow[]): {
  adultUnitPriceYuan: string
  childUnitPriceYuan: string
} {
  const adultWeightedCents = rows.reduce(
    (sum, row) => sum + row.adultUnitPriceCents * row.adultGuestCount,
    0,
  )
  const childWeightedCents = rows.reduce(
    (sum, row) => sum + row.childUnitPriceCents * row.childGuestCount,
    0,
  )
  const adultGuestTotal = rows.reduce((sum, row) => sum + row.adultGuestCount, 0)
  const childGuestTotal = rows.reduce((sum, row) => sum + row.childGuestCount, 0)

  return {
    adultUnitPriceYuan:
      adultGuestTotal > 0
        ? formatFormulaYuan(Math.round(adultWeightedCents / adultGuestTotal))
        : '-',
    childUnitPriceYuan:
      childGuestTotal > 0
        ? formatFormulaYuan(Math.round(childWeightedCents / childGuestTotal))
        : '-',
  }
}
