/** 未选路线时，出团日期闭区间最多覆盖的天数（与 API #221 一致）。 */
export const ROUTE_LEDGER_DATE_ONLY_MAX_DAYS = 7

export type RouteLedgerFilterAxes = {
  routeName?: string
  startDateFrom?: string
  startDateTo?: string
}

export type RouteLedgerQueryGate =
  | { status: 'ready'; params: { routeName?: string; startDateFrom?: string; startDateTo?: string } }
  | { status: 'empty'; message: string; detail: string }
  | { status: 'invalid'; message: string }

function inclusiveDayCount(startDateFrom: string, startDateTo: string): number {
  const startMs = Date.parse(`${startDateFrom}T00:00:00.000Z`)
  const endMs = Date.parse(`${startDateTo}T00:00:00.000Z`)
  return Math.floor((endMs - startMs) / (24 * 60 * 60 * 1000)) + 1
}

/**
 * 线路视图筛选门槛（#221）：至少路线或完整日期区间；无路线时跨度 ≤ 7 天。
 * UI 在发请求前用此 gate，避免无意义请求。
 */
export function resolveRouteLedgerQueryGate(axes: RouteLedgerFilterAxes): RouteLedgerQueryGate {
  const routeName = axes.routeName?.trim() || undefined
  const startDateFrom = axes.startDateFrom?.trim() || undefined
  const startDateTo = axes.startDateTo?.trim() || undefined
  const hasRoute = Boolean(routeName)
  const hasFrom = Boolean(startDateFrom)
  const hasTo = Boolean(startDateTo)

  if (hasFrom !== hasTo) {
    return { status: 'invalid', message: '出团日期须同时填写起止日期' }
  }

  if (!hasRoute && !hasFrom) {
    return {
      status: 'empty',
      message: '请选择路线名称或出团日期',
      detail: '线路视图可按路线扫读，也可只选出团日期查看当日/短区间有哪些团',
    }
  }

  if (!hasRoute && hasFrom && hasTo) {
    const dayCount = inclusiveDayCount(startDateFrom!, startDateTo!)
    if (dayCount < 1) {
      return { status: 'invalid', message: '出团日期区间非法' }
    }
    if (dayCount > ROUTE_LEDGER_DATE_ONLY_MAX_DAYS) {
      return {
        status: 'invalid',
        message: `未选路线时，出团日期跨度最多 ${ROUTE_LEDGER_DATE_ONLY_MAX_DAYS} 天`,
      }
    }
  }

  if (hasFrom && hasTo) {
    const dayCount = inclusiveDayCount(startDateFrom!, startDateTo!)
    if (dayCount < 1) {
      return { status: 'invalid', message: '出团日期区间非法' }
    }
  }

  return {
    status: 'ready',
    params: {
      ...(routeName ? { routeName } : {}),
      ...(startDateFrom && startDateTo
        ? { startDateFrom, startDateTo }
        : {}),
    },
  }
}
