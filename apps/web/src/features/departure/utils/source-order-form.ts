import {
  SourceOrderCollectionMode,
  SourceOrderDiscountType,
} from '@xiaotuanbao/shared'
import type { SourceOrderSummary } from '@/types/api'

export interface SourceOrderFormValues {
  partnerId: string
  adultGuestCount: number
  childGuestCount: number
  /** Required when adultGuestCount > 0; omitted treated as 0 when count is 0. */
  adultUnitPriceYuan?: number
  /** Required when childGuestCount > 0; omitted treated as 0 when count is 0. */
  childUnitPriceYuan?: number
  discountType: SourceOrderDiscountType
  discountYuan?: number
  discountNotes?: string
  collectionMode: SourceOrderCollectionMode
  partnerCollectedYuan?: number
  settlementNotes?: string
  notes?: string
}

export type SourceOrderFormAmountInput = Pick<
  SourceOrderFormValues,
  | 'adultGuestCount'
  | 'childGuestCount'
  | 'adultUnitPriceYuan'
  | 'childUnitPriceYuan'
  | 'discountType'
  | 'discountYuan'
  | 'collectionMode'
  | 'partnerCollectedYuan'
>

function yuanToCents(yuan: number): number {
  return Math.round(yuan * 100)
}

function centsToYuan(cents: number): number {
  return cents / 100
}

/** Effective unit price: when count is 0, treat missing/any price as 0. */
function effectiveUnitPriceYuan(
  guestCount: number,
  unitPriceYuan: number | undefined,
): number {
  if (guestCount === 0) {
    return 0
  }
  return unitPriceYuan ?? 0
}

/** Unit price cents for API: 0 when that guest count is 0 (ignore form price). */
function unitPriceCentsForPayload(
  guestCount: number,
  unitPriceYuan: number | undefined,
): number {
  if (guestCount === 0) {
    return 0
  }
  return yuanToCents(unitPriceYuan ?? 0)
}

export function totalGuestCount(
  values: Partial<Pick<SourceOrderFormValues, 'adultGuestCount' | 'childGuestCount'>>,
): number {
  return (values.adultGuestCount ?? 0) + (values.childGuestCount ?? 0)
}

export function computeFormAmounts(values: SourceOrderFormAmountInput) {
  const adultUnitPriceYuan = effectiveUnitPriceYuan(
    values.adultGuestCount,
    values.adultUnitPriceYuan,
  )
  const childUnitPriceYuan = effectiveUnitPriceYuan(
    values.childGuestCount,
    values.childUnitPriceYuan,
  )
  const grossReceivableCents =
    yuanToCents(adultUnitPriceYuan) * values.adultGuestCount +
    yuanToCents(childUnitPriceYuan) * values.childGuestCount
  const discountCents =
    values.discountType === SourceOrderDiscountType.LUMP_SUM
      ? yuanToCents(values.discountYuan ?? 0)
      : 0
  const netReceivableCents = grossReceivableCents - discountCents

  let partnerCollectedCents = 0
  let guestCollectCents = netReceivableCents

  if (values.collectionMode === SourceOrderCollectionMode.PARTNER_SETTLED) {
    partnerCollectedCents = netReceivableCents
    guestCollectCents = 0
  } else if (values.collectionMode === SourceOrderCollectionMode.SPLIT) {
    partnerCollectedCents = yuanToCents(values.partnerCollectedYuan ?? 0)
    guestCollectCents = netReceivableCents - partnerCollectedCents
  }

  return {
    grossReceivableCents,
    discountCents,
    netReceivableCents,
    partnerCollectedCents,
    guestCollectCents,
  }
}

export function createEmptySourceOrderFormValues(): SourceOrderFormValues {
  return {
    adultGuestCount: 0,
    childGuestCount: 0,
    discountType: SourceOrderDiscountType.NONE,
    collectionMode: SourceOrderCollectionMode.GUEST_ONLY,
  } as SourceOrderFormValues
}

export function sourceOrderToFormValues(order: SourceOrderSummary): SourceOrderFormValues {
  return {
    partnerId: order.partnerId,
    adultGuestCount: order.adultGuestCount,
    childGuestCount: order.childGuestCount,
    adultUnitPriceYuan: centsToYuan(order.adultUnitPriceCents),
    childUnitPriceYuan: centsToYuan(order.childUnitPriceCents),
    discountType: order.discountType as SourceOrderDiscountType,
    discountYuan: centsToYuan(order.discountCents),
    discountNotes: order.discountNotes ?? undefined,
    collectionMode: order.collectionMode as SourceOrderCollectionMode,
    partnerCollectedYuan: centsToYuan(order.partnerCollectedCents),
    settlementNotes: order.settlementNotes ?? undefined,
    notes: order.notes ?? undefined,
  }
}

export function formValuesToPayload(values: SourceOrderFormValues) {
  const amounts = computeFormAmounts(values)
  return {
    partnerId: values.partnerId,
    adultGuestCount: values.adultGuestCount,
    childGuestCount: values.childGuestCount,
    adultUnitPriceCents: unitPriceCentsForPayload(
      values.adultGuestCount,
      values.adultUnitPriceYuan,
    ),
    childUnitPriceCents: unitPriceCentsForPayload(
      values.childGuestCount,
      values.childUnitPriceYuan,
    ),
    discountType: values.discountType,
    discountCents: amounts.discountCents,
    discountNotes: values.discountNotes,
    collectionMode: values.collectionMode,
    partnerCollectedCents: amounts.partnerCollectedCents,
    settlementNotes: values.settlementNotes,
    notes: values.notes,
  }
}
