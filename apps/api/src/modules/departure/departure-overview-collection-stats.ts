/**
 * 发团概览团款/代收双进度与返利预估（ADR-0033 / #193）。
 * 纯函数 seam：给定各单业务事实与路径已收，产出概览口径。
 * 已确认返利应付/已付/未付由 Finance snapshot 提供，不在此聚合。
 */

export interface DepartureOverviewSourceOrderCollectionInput {
  /** 结算金额 S */
  settlementAmountCents: number
  /** G约定（定金+尾款口径） */
  guestAgreedCents: number
  /** Guest 路径（定金代收+尾款代收）有效已核销合计 */
  guestReceivedCents: number
  /** 客户结算/客户补款路径有效已核销合计 */
  customerSettlementReceivedCents: number
}

export interface DepartureOverviewCollectionStats {
  /** 团款收款进度分子：各单 min(Guest已收,S)+客户补款已收，且单笔不超过 S */
  settlementCollectionReceivedCents: number
  /** 团款收款进度分母：各单 S 合计 */
  settlementCollectionReceivableCents: number
  /** 游客代收进度分子：Guest 节点已收 */
  guestCollectionReceivedCents: number
  /** 游客代收进度分母：各单 G约定（定金+尾款口径） */
  guestCollectionAgreedCents: number
  /** 返利预估：各单 max(0, G约定−S) */
  estimatedRebateCents: number
}

/** 单笔对团款进度的贡献：min(Guest已收,S)+客户补款已收，且不超过 S。 */
export function settlementCollectionContributionCents(input: {
  settlementAmountCents: number
  guestReceivedCents: number
  customerSettlementReceivedCents: number
}): number {
  const settlementAmountCents = Math.max(0, input.settlementAmountCents)
  const guestReceivedCents = Math.max(0, input.guestReceivedCents)
  const customerSettlementReceivedCents = Math.max(0, input.customerSettlementReceivedCents)
  return Math.min(
    settlementAmountCents,
    Math.min(guestReceivedCents, settlementAmountCents) + customerSettlementReceivedCents,
  )
}

export function aggregateDepartureOverviewCollectionStats(
  sourceOrders: DepartureOverviewSourceOrderCollectionInput[],
): DepartureOverviewCollectionStats {
  let settlementCollectionReceivedCents = 0
  let settlementCollectionReceivableCents = 0
  let guestCollectionReceivedCents = 0
  let guestCollectionAgreedCents = 0
  let estimatedRebateCents = 0

  for (const order of sourceOrders) {
    // 分母保留业务源有符号金额（含遗留脏数据）；已收与返利预估仍按非负口径。
    const settlementAmountCents = order.settlementAmountCents
    const guestAgreedCents = order.guestAgreedCents
    const guestReceivedCents = Math.max(0, order.guestReceivedCents)
    const customerSettlementReceivedCents = Math.max(
      0,
      order.customerSettlementReceivedCents,
    )

    settlementCollectionReceivableCents += settlementAmountCents
    settlementCollectionReceivedCents += settlementCollectionContributionCents({
      settlementAmountCents,
      guestReceivedCents,
      customerSettlementReceivedCents,
    })
    guestCollectionAgreedCents += guestAgreedCents
    guestCollectionReceivedCents += guestReceivedCents
    estimatedRebateCents += Math.max(0, guestAgreedCents - settlementAmountCents)
  }

  return {
    settlementCollectionReceivedCents,
    settlementCollectionReceivableCents,
    guestCollectionReceivedCents,
    guestCollectionAgreedCents,
    estimatedRebateCents,
  }
}
