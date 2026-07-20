import { canPerformCapability } from '@xiaotuanbao/shared'

/**
 * ADR-0023: 是否持有 `supplier:write`（供应商目录 create/update/archive/restore）。
 * 财务无此键，只读查看账期规则、结算说明、开票与银行账户等结算信息（见 CONTEXT）。
 *
 * 派生自 `@xiaotuanbao/shared` 的能力单一事实源（capability `supplierWrite`），
 * 与后端 `@RequireMenu('supplier:write')` 共用同一把 key。
 */
export function canEditSupplier(actionKeys: string[]): boolean {
  return canPerformCapability('supplierWrite', actionKeys)
}
