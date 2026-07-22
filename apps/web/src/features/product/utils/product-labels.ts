import { ProductScheduleStatus, ProductStatus } from '@xiaotuanbao/shared'

export const PRODUCT_STATUS_LABELS: Record<ProductStatus, string> = {
  [ProductStatus.DRAFT]: '草稿',
  [ProductStatus.ON_SALE]: '销售中',
  [ProductStatus.OFFLINE]: '已下架',
}

export const PRODUCT_SCHEDULE_STATUS_LABELS: Record<ProductScheduleStatus, string> = {
  [ProductScheduleStatus.ON_SALE]: '销售中',
  [ProductScheduleStatus.CLOSED]: '已截止',
  [ProductScheduleStatus.CANCELLED]: '已取消',
}

export function yuanToCents(yuan: number | null | undefined): number | null {
  if (yuan == null || Number.isNaN(yuan)) {
    return null
  }
  return Math.round(yuan * 100)
}

export function centsToYuan(cents: number | null | undefined): number | undefined {
  if (cents == null) {
    return undefined
  }
  return cents / 100
}
