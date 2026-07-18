import { DEPARTURE_WRITE_ACTION_KEY } from '@xiaotuanbao/shared'

/**
 * ADR-0023: 是否持有 `departure:write`（发团概览/状态、客源、执行/资源的编辑与
 * 资源应付作废）。生成应收/应付不受此限制（挂在 `/departure`，见 CONTEXT）。
 */
export function canEditDeparture(actionKeys: string[]): boolean {
  return actionKeys.includes(DEPARTURE_WRITE_ACTION_KEY)
}
