import { CounterpartyType } from '../enums/counterparty-type.enum'
import { PaymentScheduleSourceType } from '../enums/payment-schedule-source-type.enum'
import { SourceOrderCollectionMode } from '../enums/source-order-collection-mode.enum'

export interface SourceOrderReceivablePathInput {
  sourceOrderId: string
  partnerId: string
  partnerName: string
  displayName: string
  collectionMode: SourceOrderCollectionMode | string
  depositCents: number
  balanceCents: number
  netReceivableCents: number
}

export interface SourceOrderReceivablePathSpec {
  sourceType: PaymentScheduleSourceType
  amountCents: number
  title: string
  counterpartyType: CounterpartyType
  counterpartyId?: string
  counterpartyName?: string
}

/** G约定：全部我方代收=定金+尾款；分拆=尾款。 */
function guestAgreedCents(order: SourceOrderReceivablePathInput): number {
  if (order.collectionMode === SourceOrderCollectionMode.GUEST_ONLY) {
    return order.depositCents + order.balanceCents
  }
  if (order.collectionMode === SourceOrderCollectionMode.SPLIT) {
    return order.balanceCents
  }
  return 0
}

/** Build receivable schedule specs for a source order's collection split (ADR-0033). */
export function buildSourceOrderReceivablePaths(
  order: SourceOrderReceivablePathInput,
): SourceOrderReceivablePathSpec[] {
  const paths: SourceOrderReceivablePathSpec[] = []

  if (order.collectionMode === SourceOrderCollectionMode.PARTNER_SETTLED) {
    if (order.netReceivableCents > 0) {
      paths.push({
        sourceType: PaymentScheduleSourceType.SOURCE_ORDER_CUSTOMER_SETTLEMENT,
        amountCents: order.netReceivableCents,
        title: '客户补款',
        counterpartyType: CounterpartyType.PARTNER,
        counterpartyId: order.partnerId,
        counterpartyName: order.partnerName,
      })
    }
    return paths
  }

  // 代收场景：建适用 Guest 期次；S−G约定>0 时同批建客户补款；不建返利。
  if (order.collectionMode === SourceOrderCollectionMode.GUEST_ONLY && order.depositCents > 0) {
    paths.push({
      sourceType: PaymentScheduleSourceType.SOURCE_ORDER_GUEST_DEPOSIT_COLLECTION,
      amountCents: order.depositCents,
      title: '定金代收',
      counterpartyType: CounterpartyType.GUEST,
      counterpartyId: order.sourceOrderId,
      counterpartyName: order.displayName,
    })
  }

  if (order.balanceCents > 0) {
    paths.push({
      sourceType: PaymentScheduleSourceType.SOURCE_ORDER_GUEST_BALANCE_COLLECTION,
      amountCents: order.balanceCents,
      title: '尾款代收',
      counterpartyType: CounterpartyType.GUEST,
      counterpartyId: order.sourceOrderId,
      counterpartyName: order.displayName,
    })
  }

  const topUpCents = Math.max(0, order.netReceivableCents - guestAgreedCents(order))
  if (topUpCents > 0) {
    paths.push({
      sourceType: PaymentScheduleSourceType.SOURCE_ORDER_CUSTOMER_SETTLEMENT,
      amountCents: topUpCents,
      title: '客户补款',
      counterpartyType: CounterpartyType.PARTNER,
      counterpartyId: order.partnerId,
      counterpartyName: order.partnerName,
    })
  }

  return paths
}

/** Count positive-amount receivable paths that generateReceivables would create. */
export function countSourceOrderReceivablePaths(
  order: Pick<
    SourceOrderReceivablePathInput,
    'collectionMode' | 'depositCents' | 'balanceCents' | 'netReceivableCents'
  >,
): number {
  return buildSourceOrderReceivablePaths({
    sourceOrderId: 'count',
    partnerId: 'count',
    partnerName: '',
    displayName: '',
    collectionMode: order.collectionMode,
    depositCents: order.depositCents,
    balanceCents: order.balanceCents,
    netReceivableCents: order.netReceivableCents,
  }).filter((path) => path.amountCents > 0).length
}
