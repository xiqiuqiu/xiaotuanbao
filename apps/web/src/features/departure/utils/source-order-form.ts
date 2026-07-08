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

function yuanToCents(yuan: number): number {
  return Math.round(yuan * 100)
}

function centsToYuan(cents: number): number {
  return cents / 100
}

export function computeFormAmounts(values: Pick<
  SourceOrderFormValues,
  'guestCount' | 'unitPriceYuan' | 'discountType' | 'discountYuan' | 'collectionMode' | 'partnerCollectedYuan'
>) {
  const grossReceivableCents = yuanToCents(values.unitPriceYuan) * values.guestCount
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
  const amounts = computeFormAmounts(values)
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
