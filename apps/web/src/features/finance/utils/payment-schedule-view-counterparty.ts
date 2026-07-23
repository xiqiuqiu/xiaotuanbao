export type ViewCounterpartyFilter = {
  counterpartyKeyword: string
}

/** Map 客源单「客户」→ 应收收款对象名称关键字。 */
export function counterpartyFilterFromSourceOrder(order: {
  partnerName: string
}): ViewCounterpartyFilter | undefined {
  const counterpartyKeyword = order.partnerName.trim()
  if (!counterpartyKeyword) {
    return undefined
  }
  return { counterpartyKeyword }
}

/** Map 资源对手方 → 应付付款对象名称关键字。 */
export function counterpartyFilterFromSegmentResource(resource: {
  counterpartyName: string
}): ViewCounterpartyFilter | undefined {
  const counterpartyKeyword = resource.counterpartyName.trim()
  if (!counterpartyKeyword) {
    return undefined
  }
  return { counterpartyKeyword }
}
