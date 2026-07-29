import { BadRequestException } from '@nestjs/common'
import { computeDayCount, parseDateOnly } from './departure-date.utils'

/** 未选路线时，出团日期闭区间最多覆盖的天数（含起止当日）。 */
export const ROUTE_LEDGER_DATE_ONLY_MAX_DAYS = 7

export type RouteLedgerQueryAxes = {
  routeName?: string
  startDateFrom?: string
  startDateTo?: string
}

/**
 * 线路视图双轴门槛（#221）：
 * - 至少选路线或完整出团日期区间之一
 * - 日期须起止成对；无路线时跨度 ≤ 7 天
 */
export function assertRouteLedgerQueryAxes(query: RouteLedgerQueryAxes): {
  routeName: string | null
  startDateFrom: string | null
  startDateTo: string | null
} {
  const routeName = query.routeName?.trim() || null
  const startDateFrom = query.startDateFrom?.trim() || null
  const startDateTo = query.startDateTo?.trim() || null
  const hasRoute = Boolean(routeName)
  const hasFrom = Boolean(startDateFrom)
  const hasTo = Boolean(startDateTo)

  if (hasFrom !== hasTo) {
    throw new BadRequestException('出团日期须同时填写起止日期')
  }

  if (!hasRoute && !hasFrom) {
    throw new BadRequestException('请选择路线名称或完整的出团日期区间')
  }

  if (!hasRoute && hasFrom && hasTo) {
    const dayCount = computeDayCount(parseDateOnly(startDateFrom!), parseDateOnly(startDateTo!))
    if (dayCount > ROUTE_LEDGER_DATE_ONLY_MAX_DAYS) {
      throw new BadRequestException(
        `未选路线时，出团日期跨度最多 ${ROUTE_LEDGER_DATE_ONLY_MAX_DAYS} 天`,
      )
    }
    if (dayCount < 1) {
      throw new BadRequestException('出团日期区间非法')
    }
  }

  if (hasFrom && hasTo) {
    const dayCount = computeDayCount(parseDateOnly(startDateFrom!), parseDateOnly(startDateTo!))
    if (dayCount < 1) {
      throw new BadRequestException('出团日期区间非法')
    }
  }

  return { routeName, startDateFrom, startDateTo }
}
