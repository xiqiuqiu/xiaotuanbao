import type { ProductScheduleStatus } from '@xiaotuanbao/shared'
import type { ProductSchedulePayload } from '@/services/product.service'
import { yuanToCents } from './product-labels'

export type ScheduleFormValues = {
  title?: string
  dateRuleText?: string
  startDate?: string
  endDate?: string
  status: ProductScheduleStatus
  priceOnInquiry: boolean
  adultPriceYuan?: number | null
  childPriceYuan?: number | null
  singleRoomSupplementYuan?: number | null
  notes?: string
}

/**
 * Empty price inputs must be omitted (not sent as null).
 * Backend treats omitted fields as "use spec defaults" on create /
 * "keep existing" on update; explicit null overrides that fallback.
 */
export function buildProductSchedulePayload(values: ScheduleFormValues): ProductSchedulePayload {
  const adultPriceCents = yuanToCents(values.adultPriceYuan)
  const childPriceCents = yuanToCents(values.childPriceYuan)
  const singleRoomSupplementCents = yuanToCents(values.singleRoomSupplementYuan)

  return {
    title: values.title?.trim() ?? '',
    dateRuleText: values.dateRuleText?.trim() ?? '',
    startDate: values.startDate || null,
    endDate: values.endDate || null,
    status: values.status,
    priceOnInquiry: values.priceOnInquiry,
    ...(adultPriceCents != null ? { adultPriceCents } : {}),
    ...(childPriceCents != null ? { childPriceCents } : {}),
    ...(singleRoomSupplementCents != null ? { singleRoomSupplementCents } : {}),
    notes: values.notes?.trim() || null,
  }
}
