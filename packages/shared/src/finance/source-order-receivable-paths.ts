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

  // 代收场景：只建适用的定金/尾款 Guest 节点；不建客户补款与返利。
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
