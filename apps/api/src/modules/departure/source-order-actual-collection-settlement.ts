import {
  CounterpartyType,
  PaymentScheduleDirection,
  PaymentScheduleSourceType,
} from '@xiaotuanbao/shared'

export interface ActualCollectionSettlementInput {
  sourceOrderId: string
  partnerId: string
  partnerName: string
  /** 结算金额 S（分） */
  netReceivableCents: number
  /** G实收：定金/尾款节点有效已核销合计（分） */
  actualGuestCollectedCents: number
}

export interface ActualCollectionSettlementPathSpec {
  direction: PaymentScheduleDirection
  sourceType: PaymentScheduleSourceType
  amountCents: number
  title: string
  counterpartyType: CounterpartyType
  counterpartyId: string
  counterpartyName: string
}

/**
 * 按实收结算路径规格：客户补款应收 + 返利应付（ADR-0033）。
 * 金额 >0 才出现；P 不进入公式。
 */
export function buildActualCollectionSettlementPaths(
  input: ActualCollectionSettlementInput,
): ActualCollectionSettlementPathSpec[] {
  const topUpCents = Math.max(0, input.netReceivableCents - input.actualGuestCollectedCents)
  const rebateCents = Math.max(0, input.actualGuestCollectedCents - input.netReceivableCents)
  const paths: ActualCollectionSettlementPathSpec[] = []

  if (topUpCents > 0) {
    paths.push({
      direction: PaymentScheduleDirection.RECEIVABLE,
      sourceType: PaymentScheduleSourceType.SOURCE_ORDER_CUSTOMER_SETTLEMENT,
      amountCents: topUpCents,
      title: '客户补款',
      counterpartyType: CounterpartyType.PARTNER,
      counterpartyId: input.partnerId,
      counterpartyName: input.partnerName,
    })
  }

  if (rebateCents > 0) {
    paths.push({
      direction: PaymentScheduleDirection.PAYABLE,
      sourceType: PaymentScheduleSourceType.SOURCE_ORDER_REBATE,
      amountCents: rebateCents,
      title: '返利',
      counterpartyType: CounterpartyType.PARTNER,
      counterpartyId: input.partnerId,
      counterpartyName: input.partnerName,
    })
  }

  return paths
}

export function assertGuestNodesReadyForSettlement(params: {
  guestNodes: Array<{ amountCents: number; settledAmountCents: number }>
  earlySettle: boolean
}): void {
  if (params.earlySettle) {
    return
  }
  const unsettled = params.guestNodes.some(
    (node) => node.settledAmountCents < node.amountCents,
  )
  if (unsettled) {
    throw new Error('相关游客代收节点尚未结清，如需办理请选择提前按实收结算')
  }
}
