import { COUNTERPARTY_TYPE_LABELS, catalogLabel } from '../catalog'

/**
 * 流水 / 核销「收款方式」：由往来对象类型派生。
 * 游客代收单独成列，不再拼进「往来对象」（对齐应收列表拆分）。
 */
export function counterpartyCollectionMethodText(counterpartyType: string): string {
  return catalogLabel(COUNTERPARTY_TYPE_LABELS, counterpartyType)
}

/** 「往来对象」展示值：仅对手方名称，不含类型前缀。 */
export function counterpartyDisplayName(
  counterpartyName: string | null | undefined,
): string {
  const name = counterpartyName?.trim()
  return name || '-'
}
