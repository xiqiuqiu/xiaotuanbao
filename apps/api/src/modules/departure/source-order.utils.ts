import type { SourceOrderCollectionMode, SourceOrderDiscountType } from '@prisma/client'

export interface SourceOrderAmountInput {
  guestCount: number
  unitPriceCents: number
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

export function computeSourceOrderAmounts(input: SourceOrderAmountInput): SourceOrderAmounts {
  const grossReceivableCents = input.unitPriceCents * input.guestCount
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

export function formatDepartureDateChinese(date: Date): string {
  const month = date.getUTCMonth() + 1
  const day = date.getUTCDate()
  return `${month}月${day}日`
}

export function buildSourceOrderDisplayName(
  partnerName: string,
  startDate: Date,
  sequence: number,
): string {
  const base = `${partnerName} ${formatDepartureDateChinese(startDate)}发客`
  return sequence > 1 ? `${base} ${sequence}` : base
}
