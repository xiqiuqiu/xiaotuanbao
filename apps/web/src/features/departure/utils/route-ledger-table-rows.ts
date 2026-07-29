import type {
  RouteLedgerDateBlock,
  RouteLedgerDepartureGroup,
  RouteLedgerSourceOrderRow,
} from '@xiaotuanbao/shared'

/** 日表展平行：同发团首行带 rowSpan，后续行 rowSpan=0（单元格隐藏）。 */
export type RouteLedgerTableRow = RouteLedgerSourceOrderRow & {
  seq: number
  departureNo: string
  departureName: string
  /** 发团列合并跨度；0 表示本行不渲染该单元格 */
  departureRowSpan: number
  departureGroup: RouteLedgerDepartureGroup
}

/**
 * 将发团组展平为单表行；空客源发团不进表（由 UI 在表外提示）。
 * 同发团连续行对「发团」列使用 rowSpan。
 */
export function flattenRouteLedgerDepartures(
  departures: RouteLedgerDepartureGroup[],
): {
  rows: RouteLedgerTableRow[]
  emptyDepartures: RouteLedgerDepartureGroup[]
} {
  const rows: RouteLedgerTableRow[] = []
  const emptyDepartures: RouteLedgerDepartureGroup[] = []
  let seq = 1

  for (const group of departures) {
    if (group.sourceOrders.length === 0) {
      emptyDepartures.push(group)
      continue
    }
    const span = group.sourceOrders.length
    group.sourceOrders.forEach((order, index) => {
      rows.push({
        ...order,
        seq: seq++,
        departureNo: group.departureNo,
        departureName: group.departureName,
        departureRowSpan: index === 0 ? span : 0,
        departureGroup: group,
      })
    })
  }

  return { rows, emptyDepartures }
}

/** 将日块下各路线段的发团一并展平（有路线查询时每日通常一段）。 */
export function flattenRouteLedgerDateBlock(
  block: RouteLedgerDateBlock,
): {
  rows: RouteLedgerTableRow[]
  emptyDepartures: RouteLedgerDepartureGroup[]
} {
  return flattenRouteLedgerDepartures(
    block.routes.flatMap((route) => route.departures),
  )
}
