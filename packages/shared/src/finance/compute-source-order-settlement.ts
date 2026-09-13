import { SourceOrderDiscountType } from '../enums/source-order-discount-type.enum'

export interface SourceOrderSettlementAdjustmentInput {
  direction: 'increase' | 'decrease'
  amountCents: number
}

export interface SourceOrderSettlementInput {
  adultGuestCount: number
  childGuestCount: number
  adultUnitPriceCents?: number | null
  childUnitPriceCents?: number | null
  fareAdjustments?: readonly SourceOrderSettlementAdjustmentInput[]
  discountType: SourceOrderDiscountType | 'none' | 'lump_sum'
  discountCents: number
}

export interface SourceOrderSettlementCents {
  grossReceivableCents: number
  fareAdjustmentNetCents: number
  discountCents: number
  netReceivableCents: number
}

export function computeFareAdjustmentNetCents(
  fareAdjustments: readonly SourceOrderSettlementAdjustmentInput[] | undefined,
): number {
  let net = 0
  for (const item of fareAdjustments ?? []) {
    const amount = Math.max(item.amountCents, 0)
    if (item.direction === 'increase') {
      net += amount
    } else {
      net -= amount
    }
  }
  return net
}

export function computeCollectionSettlementPreview(
  netReceivableCents: number,
  guestCollectCents: number,
): { estimatedCustomerTopUpCents: number; estimatedRebateCents: number } {
  return {
    estimatedCustomerTopUpCents: Math.max(0, netReceivableCents - guestCollectCents),
    estimatedRebateCents: Math.max(0, guestCollectCents - netReceivableCents),
  }
}

function effectiveUnitPriceCents(
  guestCount: number,
  unitPriceCents: number | null | undefined,
): number {
  if (guestCount === 0) {
    return 0
  }
  return unitPriceCents ?? 0
}

export function computeSourceOrderSettlementCents(
  input: SourceOrderSettlementInput,
): SourceOrderSettlementCents {
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
  const fareAdjustmentNetCents = computeFareAdjustmentNetCents(input.fareAdjustments)
  const discountCents =
    input.discountType === SourceOrderDiscountType.LUMP_SUM
      ? Math.max(input.discountCents, 0)
      : 0
  return {
    grossReceivableCents,
    fareAdjustmentNetCents,
    discountCents,
    netReceivableCents: grossReceivableCents + fareAdjustmentNetCents - discountCents,
  }
}
