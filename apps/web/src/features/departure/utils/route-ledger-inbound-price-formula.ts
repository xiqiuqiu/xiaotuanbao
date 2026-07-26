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

function formatFormulaYuan(cents: number): string {
  return String(cents / 100)
}
