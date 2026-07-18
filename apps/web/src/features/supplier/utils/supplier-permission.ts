import { SUPPLIER_WRITE_ACTION_KEY } from '@xiaotuanbao/shared'

/**
 * ADR-0023: 是否持有 `supplier:write`（供应商目录 create/update/archive/restore）。
 * 财务无此键，只读查看账期规则、结算说明、开票与银行账户等结算信息（见 CONTEXT）。
 */
export function canEditSupplier(actionKeys: string[]): boolean {
  return actionKeys.includes(SUPPLIER_WRITE_ACTION_KEY)
}
