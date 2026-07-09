import {
  SourceOrderCollectionMode,
  SourceOrderDiscountType,
} from '@xiaotuanbao/shared'
import type { SourceOrderSummary } from '@/types/api'

export interface SourceOrderFormValues {
  partnerId: string
  guestCount: number
  unitPriceYuan: number
  discountType: SourceOrderDiscountType
  discountYuan?: number
  discountNotes?: string
  collectionMode: SourceOrderCollectionMode
  partnerCollectedYuan?: number
  settlementNotes?: string
  notes?: string
}

export interface SourceOrderFormAmountInput {
  adultGuestCount: number
  childGuestCount: number
  /** Required when adultGuestCount > 0; omitted treated as 0 when count is 0. */
  adultUnitPriceYuan?: number
  /** Required when childGuestCount > 0; omitted treated as 0 when count is 0. */
  childUnitPriceYuan?: number
  discountType: SourceOrderDiscountType
  discountYuan?: number
  collectionMode: SourceOrderCollectionMode
  partnerCollectedYuan?: number
}

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

/** Maps legacy single guestCount/unitPrice form to adult/child amount input (child = 0). */
export function legacyFormValuesToAmountInput(
  values: Pick<
    SourceOrderFormValues,
    | 'guestCount'
    | 'unitPriceYuan'
    | 'discountType'
    | 'discountYuan'
    | 'collectionMode'
    | 'partnerCollectedYuan'
  >,
): SourceOrderFormAmountInput {
  return {
    adultGuestCount: values.guestCount,
    childGuestCount: 0,
    adultUnitPriceYuan: values.unitPriceYuan,
    childUnitPriceYuan: 0,
    discountType: values.discountType,
    discountYuan: values.discountYuan,
    collectionMode: values.collectionMode,
    partnerCollectedYuan: values.partnerCollectedYuan,
  }
}

export function createEmptySourceOrderFormValues(): SourceOrderFormValues {
  return {
    guestCount: 1,
    discountType: SourceOrderDiscountType.NONE,
    collectionMode: SourceOrderCollectionMode.GUEST_ONLY,
    unitPriceYuan: 0,
  } as SourceOrderFormValues
}

export function sourceOrderToFormValues(order: SourceOrderSummary): SourceOrderFormValues {
  return {
    partnerId: order.partnerId,
    guestCount: order.guestCount,
    unitPriceYuan: centsToYuan(order.unitPriceCents),
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
  // #67: amount helper is adult/child; HTTP payload still guestCount×unitPrice until #68/#69
  const amounts = computeFormAmounts(legacyFormValuesToAmountInput(values))
  return {
    partnerId: values.partnerId,
    guestCount: values.guestCount,
    unitPriceCents: yuanToCents(values.unitPriceYuan),
    discountType: values.discountType,
    discountCents: amounts.discountCents,
    discountNotes: values.discountNotes,
    collectionMode: values.collectionMode,
    partnerCollectedCents: amounts.partnerCollectedCents,
    settlementNotes: values.settlementNotes,
    notes: values.notes,
  }
}
