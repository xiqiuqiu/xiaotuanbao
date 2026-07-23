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

/** Stored amount snapshot used to detect locked-field edits vs unit-price heal. */
export interface SourceOrderStoredAmounts {
  adultGuestCount: number
  childGuestCount: number
  adultUnitPriceCents: number
  childUnitPriceCents: number
  discountType: SourceOrderDiscountType
  discountCents: number
  collectionMode: SourceOrderCollectionMode
  partnerCollectedCents: number
  guestCollectCents: number
  grossReceivableCents: number
  netReceivableCents: number
}

export interface SourceOrderAmountChange {
  /** Any amount-related input field differs from the stored row (incl. unit prices). */
  amountInputsChanged: boolean
  /**
   * True when the update would change authoritative path amounts.
   * Unit-price-only diffs that still reproduce stored gross/net/paths are a no-op heal
   * (common after receivable path sync left unit prices stale).
   */
  amountOutcomeChanged: boolean
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

/**
 * Reconcile dominant unit price so count × price matches authoritative gross.
 * Used after receivable path sync updates gross without rewriting unit prices.
 */
export function reconcileUnitPricesToGross(params: {
  adultGuestCount: number
  childGuestCount: number
  adultUnitPriceCents: number
  childUnitPriceCents: number
  grossReceivableCents: number
}): { adultUnitPriceCents: number; childUnitPriceCents: number } {
  const adultUnitPriceCents = effectiveUnitPriceCents(
    params.adultGuestCount,
    params.adultUnitPriceCents,
  )
  const childUnitPriceCents = effectiveUnitPriceCents(
    params.childGuestCount,
    params.childUnitPriceCents,
  )
  const impliedGross =
    adultUnitPriceCents * params.adultGuestCount +
    childUnitPriceCents * params.childGuestCount
  if (impliedGross === params.grossReceivableCents) {
    return { adultUnitPriceCents, childUnitPriceCents }
  }

  if (params.adultGuestCount > 0) {
    const childCents = childUnitPriceCents * params.childGuestCount
    return {
      adultUnitPriceCents: Math.round(
        (params.grossReceivableCents - childCents) / params.adultGuestCount,
      ),
      childUnitPriceCents,
    }
  }
  if (params.childGuestCount > 0) {
    return {
      adultUnitPriceCents,
      childUnitPriceCents: Math.round(
        params.grossReceivableCents / params.childGuestCount,
      ),
    }
  }
  return { adultUnitPriceCents, childUnitPriceCents }
}

export function resolveSourceOrderAmountChange(
  order: SourceOrderStoredAmounts,
  next: SourceOrderAmountInput,
): SourceOrderAmountChange {
  const nextAdultUnitPriceCents = effectiveUnitPriceCents(
    next.adultGuestCount,
    next.adultUnitPriceCents,
  )
  const nextChildUnitPriceCents = effectiveUnitPriceCents(
    next.childGuestCount,
    next.childUnitPriceCents,
  )
  const nextDiscountCents =
    next.discountType === 'lump_sum' ? Math.max(next.discountCents, 0) : 0

  const amountInputsChanged =
    order.adultGuestCount !== next.adultGuestCount ||
    order.childGuestCount !== next.childGuestCount ||
    order.adultUnitPriceCents !== nextAdultUnitPriceCents ||
    order.childUnitPriceCents !== nextChildUnitPriceCents ||
    order.discountType !== next.discountType ||
    order.discountCents !== nextDiscountCents ||
    order.collectionMode !== next.collectionMode ||
    order.partnerCollectedCents !== next.partnerCollectedCents

  if (!amountInputsChanged) {
    return { amountInputsChanged: false, amountOutcomeChanged: false }
  }

  const nextComputed = computeSourceOrderAmounts(next)
  const outcomesMatch =
    order.grossReceivableCents === nextComputed.grossReceivableCents &&
    order.discountCents === nextComputed.discountCents &&
    order.netReceivableCents === nextComputed.netReceivableCents &&
    order.partnerCollectedCents === nextComputed.partnerCollectedCents &&
    order.guestCollectCents === nextComputed.guestCollectCents

  return {
    amountInputsChanged: true,
    amountOutcomeChanged: !outcomesMatch,
  }
}

/** 客源单展示名：合作伙伴名；同发团同伙伴多单时追加序号。不拼出团日期（发团页顶栏已有）。 */
export function buildSourceOrderDisplayName(partnerName: string, sequence: number): string {
  return sequence > 1 ? `${partnerName} ${sequence}` : partnerName
}
