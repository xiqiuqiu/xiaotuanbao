/**
 * ADR-0025：创建班期时从规格默认价复制快照；之后改默认价不回写既有班期。
 */

export interface ProductSpecDefaultPrices {
  adultPriceCents: number | null
  childPriceCents: number | null
  singleSupplementCents: number | null
}

export interface ProductSchedulePriceSnapshot {
  adultPriceCents: number | null
  childPriceCents: number | null
  singleSupplementCents: number | null
}

/** 创建班期时从当时规格默认价复制出班期价格快照。 */
export function snapshotSchedulePricesFromSpec(
  specDefaults: ProductSpecDefaultPrices,
): ProductSchedulePriceSnapshot {
  return {
    adultPriceCents: specDefaults.adultPriceCents,
    childPriceCents: specDefaults.childPriceCents,
    singleSupplementCents: specDefaults.singleSupplementCents,
  }
}

/**
 * 班期是否可作为上架门槛中的「可展示班期」：
 * 非已取消，且有成人价或明确询价。
 */
export function isDisplayableProductSchedule(schedule: {
  status: string
  adultPriceCents: number | null
  inquireOnly: boolean
}): boolean {
  if (schedule.status === 'cancelled') {
    return false
  }
  return schedule.adultPriceCents != null || schedule.inquireOnly
}

/** 是否计入有效班期/价格统计（已取消不计入）。 */
export function isEffectiveProductSchedule(schedule: { status: string }): boolean {
  return schedule.status !== 'cancelled'
}

/**
 * 上架门槛：名称 + 简版行程 + 至少一条可展示班期。
 * 特色/详细行程/须知不作门槛。
 */
export function canPublishProduct(input: {
  name: string
  shortItinerary: string | null | undefined
  schedules: Array<{
    status: string
    adultPriceCents: number | null
    inquireOnly: boolean
  }>
}): boolean {
  const nameOk = input.name.trim().length > 0
  const itineraryOk = Boolean(input.shortItinerary?.trim())
  const hasDisplayable = input.schedules.some(isDisplayableProductSchedule)
  return nameOk && itineraryOk && hasDisplayable
}
