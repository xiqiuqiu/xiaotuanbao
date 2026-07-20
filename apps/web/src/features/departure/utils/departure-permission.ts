import { canPerformCapability } from '@xiaotuanbao/shared'

/**
 * ADR-0023: 是否持有 `departure:write`（发团概览/状态、客源、执行/资源的编辑与
 * 资源应付作废）。生成应收/应付不受此限制（挂在 `/departure`，见 CONTEXT）。
 *
 * 派生自 `@xiaotuanbao/shared` 的能力单一事实源（capability `departureWrite`），
 * 与后端 `@RequireMenu('departure:write')` 共用同一把 key。
 */
export function canEditDeparture(actionKeys: string[]): boolean {
  return canPerformCapability('departureWrite', actionKeys)
}
