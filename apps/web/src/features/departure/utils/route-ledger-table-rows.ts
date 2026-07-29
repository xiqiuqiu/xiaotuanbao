import type {
  RouteLedgerDepartureGroup,
  RouteLedgerSourceOrderRow,
} from '@xiaotuanbao/shared'

/** 单发团日报表内的客源展平行。 */
export type RouteLedgerTableRow = RouteLedgerSourceOrderRow & {
  seq: number
}

/** 将单个发团的客源单展平为表行；空客源返回空数组（由表空态展示）。 */
export function flattenRouteLedgerDeparture(
  departure: RouteLedgerDepartureGroup,
): RouteLedgerTableRow[] {
  return departure.sourceOrders.map((order, index) => ({
    ...order,
    seq: index + 1,
  }))
}
