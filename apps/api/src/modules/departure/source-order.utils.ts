import type { SourceOrderCollectionMode, SourceOrderDiscountType } from '@prisma/client'

export interface SourceOrderAmountInput {
  adultGuestCount: number
  childGuestCount: number
  /** Required when adultGuestCount > 0; omitted/null treated as 0 when count is 0. */
  adultUnitPriceCents?: number | null
  /** Required when childGuestCount > 0; omitted/null treated as 0 when count is 0. */
  childUnitPriceCents?: number | null
  discountType: SourceOrderDiscountType
  discountCents: number
  collectionMode: SourceOrderCollectionMode
  partnerCollectedCents: number
}

export interface SourceOrderAmounts {
  grossReceivableCents: number
  discountCents: number
  netReceivableCents: number
  partnerCollectedCents: number
  guestCollectCents: number
}

/** Effective unit price: when count is 0, treat missing/any price as 0. */
function effectiveUnitPriceCents(
  guestCount: number,
  unitPriceCents: number | null | undefined,
): number {
  if (guestCount === 0) {
    return 0
  }
  return unitPriceCents ?? 0
}

export function computeSourceOrderAmounts(input: SourceOrderAmountInput): SourceOrderAmounts {
  const adultUnitPriceCents = effectiveUnitPriceCents(
    input.adultGuestCount,
    input.adultUnitPriceCents,
  )
  const childUnitPriceCents = effectiveUnitPriceCents(
    input.childGuestCount,
    input.childUnitPriceCents,
  )
  const grossReceivableCents =
    adultUnitPriceCents * input.adultGuestCount + childUnitPriceCents * input.childGuestCount
  const discountCents =
    input.discountType === 'lump_sum' ? Math.max(input.discountCents, 0) : 0
  const netReceivableCents = grossReceivableCents - discountCents

  let partnerCollectedCents = 0
  let guestCollectCents = netReceivableCents

  if (input.collectionMode === 'guest_only') {
    partnerCollectedCents = 0
    guestCollectCents = netReceivableCents
  } else if (input.collectionMode === 'partner_settled') {
    partnerCollectedCents = netReceivableCents
    guestCollectCents = 0
  } else {
    partnerCollectedCents = input.partnerCollectedCents
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

/** 客源单展示名：合作伙伴名；同发团同伙伴多单时追加序号。不拼出团日期（发团页顶栏已有）。 */
export function buildSourceOrderDisplayName(partnerName: string, sequence: number): string {
  return sequence > 1 ? `${partnerName} ${sequence}` : partnerName
}
