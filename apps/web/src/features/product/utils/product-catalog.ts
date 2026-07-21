import {
  PRODUCT_SCHEDULE_STATUS_LABELS,
  PRODUCT_STATUS_LABELS,
  ProductScheduleStatus,
  ProductStatus,
} from '@xiaotuanbao/shared'

export const PRODUCT_STATUS_OPTIONS = (
  Object.values(ProductStatus) as ProductStatus[]
).map((value) => ({
  value,
  label: PRODUCT_STATUS_LABELS[value],
}))

export const PRODUCT_SCHEDULE_STATUS_OPTIONS = (
  Object.values(ProductScheduleStatus) as ProductScheduleStatus[]
).map((value) => ({
  value,
  label: PRODUCT_SCHEDULE_STATUS_LABELS[value],
}))

export function yuanToCents(yuan: number | null | undefined): number | null {
  if (yuan === null || yuan === undefined || Number.isNaN(yuan)) {
    return null
  }
  return Math.round(yuan * 100)
}

export function centsToYuan(cents: number | null | undefined): number | null {
  if (cents === null || cents === undefined) {
    return null
  }
  return cents / 100
}
