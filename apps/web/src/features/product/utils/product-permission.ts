import { canPerformCapability } from '@xiaotuanbao/shared'

/**
 * ADR-0023 / #149: 是否持有 `product:write`。
 * 财务无此键，产品中心只读。
 */
export function canEditProduct(actionKeys: string[]): boolean {
  return canPerformCapability('productWrite', actionKeys)
}
