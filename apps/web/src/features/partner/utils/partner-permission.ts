import { canPerformCapability } from '@xiaotuanbao/shared'

/**
 * ADR-0023: 是否持有 `partner:write`（合作伙伴目录 create/update/archive/restore）。
 * 往来账款读取与账款操作不受此限制（走 `/partner` 与 `/finance/*`，见 CONTEXT）。
 *
 * 派生自 `@xiaotuanbao/shared` 的能力单一事实源（capability `partnerWrite`），
 * 与后端 `@RequireMenu('partner:write')` 共用同一把 key。
 */
export function canEditPartner(actionKeys: string[]): boolean {
  return canPerformCapability('partnerWrite', actionKeys)
}
