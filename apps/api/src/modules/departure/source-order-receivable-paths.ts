import {
  CounterpartyType,
  PaymentScheduleSourceType,
} from '@xiaotuanbao/shared'

export interface SourceOrderReceivablePathInput {
  sourceOrderId: string
  partnerId: string
  partnerName: string
  displayName: string
  partnerCollectedCents: number
  guestCollectCents: number
}

export interface SourceOrderReceivablePathSpec {
  sourceType: PaymentScheduleSourceType
  amountCents: number
  title: string
  counterpartyType: CounterpartyType
  counterpartyId?: string
  counterpartyName?: string
}

/** Build receivable schedule specs for a source order's collection split. */
export function buildSourceOrderReceivablePaths(
  order: SourceOrderReceivablePathInput,
): SourceOrderReceivablePathSpec[] {
  const paths: SourceOrderReceivablePathSpec[] = []

  if (order.partnerCollectedCents > 0) {
    paths.push({
      sourceType: PaymentScheduleSourceType.SOURCE_ORDER_CUSTOMER_SETTLEMENT,
      amountCents: order.partnerCollectedCents,
      title: '客户补款',
      counterpartyType: CounterpartyType.PARTNER,
      counterpartyId: order.partnerId,
      counterpartyName: order.partnerName,
    })
  }

  if (order.guestCollectCents > 0) {
    paths.push({
      sourceType: PaymentScheduleSourceType.SOURCE_ORDER_GUEST_COLLECTION,
      amountCents: order.guestCollectCents,
      title: '游客代收',
      counterpartyType: CounterpartyType.GUEST,
      counterpartyId: order.sourceOrderId,
      counterpartyName: order.displayName,
    })
  }

  return paths
}
