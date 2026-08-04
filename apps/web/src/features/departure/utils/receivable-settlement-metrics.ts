/** Overview（全团）vs 客源列表筛选；路径数不在本 module。 */
export type ReceivableSettlementScope = 'full' | 'filter'

export interface FullDepartureReceivableSettlementMetrics {
  scope: 'full'
  /** 概览「结算应收」：发团 netReceivableCents。 */
  settlementReceivableCents: number
  /** 团款收款进度分母。 */
  collectionReceivableCents: number
  /** 团款收款进度分子。 */
  collectionReceivedCents: number
  /** 团款未收；不做 clamp，保留守恒异常符号。 */
  collectionUnreceivedCents: number
  ungeneratedReceivableCents: number
}

export function buildFullDepartureReceivableSettlementMetrics(input: {
  netReceivableCents: number
  settlementCollectionReceivableCents: number
  settlementCollectionReceivedCents: number
  ungeneratedReceivableCents: number
}): FullDepartureReceivableSettlementMetrics {
  return {
    scope: 'full',
    settlementReceivableCents: input.netReceivableCents,
    collectionReceivableCents: input.settlementCollectionReceivableCents,
    collectionReceivedCents: input.settlementCollectionReceivedCents,
    collectionUnreceivedCents:
      input.settlementCollectionReceivableCents -
      input.settlementCollectionReceivedCents,
    ungeneratedReceivableCents: input.ungeneratedReceivableCents,
  }
}

export function tagReceivableSettlementScope<
  T extends object,
  S extends ReceivableSettlementScope,
>(value: T, scope: S): T & { scope: S } {
  return { ...value, scope }
}
