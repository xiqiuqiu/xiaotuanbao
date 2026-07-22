import { canPerformCapability } from '@xiaotuanbao/shared'

/**
 * ADR-0023: 是否持有 `product:write`（产品中心 Product/Spec/Schedule 维护）。
 * 财务无此键，可进入 `/product` 只读查看。
 */
export function canEditProduct(actionKeys: string[]): boolean {
  return canPerformCapability('productWrite', actionKeys)
}
