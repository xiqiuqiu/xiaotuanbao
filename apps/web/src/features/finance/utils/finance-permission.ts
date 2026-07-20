import { canPerformCapability } from '@xiaotuanbao/shared'

/**
 * ADR-0023: 是否可执行财务账款操作（登记收/付款、匹配流水/去核销、关闭/重开节点、
 * 调整约定金额、新建/编辑/作废流水、核销/撤销核销）。
 *
 * 派生自 `@xiaotuanbao/shared` 的能力单一事实源（capability `financeMutate`）。以
 * `/finance/receivable` 作统一 gating 口径：预设角色下持有它 ⟺ 持有全部四个 /finance/*
 * 菜单，后端 PaymentScheduleCancelController 亦以此对齐。
 */
export function canMutateFinance(menuKeys: string[]): boolean {
  return canPerformCapability('financeMutate', menuKeys)
}
