/**
 * 线路视图只读「拼入价」算式：成人/儿童单价（分）× 人数，元为单位。
 * 人数为 0 的一侧省略；两端皆无则空串。不参与权威合计。
 */
export function formatRouteLedgerInboundPriceFormula(input: {
  adultGuestCount: number
  childGuestCount: number
  adultUnitPriceCents: number
  childUnitPriceCents: number
}): string {
  const parts: string[] = []
  if (input.adultGuestCount > 0) {
    parts.push(`${formatFormulaYuan(input.adultUnitPriceCents)}×${input.adultGuestCount}`)
  }
  if (input.childGuestCount > 0) {
    parts.push(`${formatFormulaYuan(input.childUnitPriceCents)}×${input.childGuestCount}`)
  }
  return parts.join('+')
}

/**
 * 线路视图「拼入价」只读单价（元）：有儿童时「成人/儿童」，否则仅成人价。
 * 两侧人数皆为 0 时为空串。不参与权威合计。
 */
export function formatRouteLedgerInboundUnitPrice(input: {
  adultGuestCount: number
  childGuestCount: number
  adultUnitPriceCents: number
  childUnitPriceCents: number
}): string {
  const hasAdult = input.adultGuestCount > 0
  const hasChild = input.childGuestCount > 0
  if (!hasAdult && !hasChild) {
    return ''
  }
  if (hasAdult && hasChild) {
    return `${formatFormulaYuan(input.adultUnitPriceCents)}/${formatFormulaYuan(input.childUnitPriceCents)}`
  }
  if (hasAdult) {
    return formatFormulaYuan(input.adultUnitPriceCents)
  }
  return formatFormulaYuan(input.childUnitPriceCents)
}

/** 单价分→元展示（去多余小数尾零由 Number→String 自然处理）。 */
export function formatRouteLedgerUnitPriceYuan(cents: number): string {
  return formatFormulaYuan(cents)
}

function formatFormulaYuan(cents: number): string {
  return String(cents / 100)
}

type UnitPriceRow = {
  adultGuestCount: number
  childGuestCount: number
  adultUnitPriceCents: number
  childUnitPriceCents: number
}

/** 合计行拼入价：按人数加权平均单价（元）；该侧人数为 0 时显示 -。 */
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
