import type { SourceOrderSummary } from '@/types/api'
import {
  buildSourceOrdersListGlance,
  type SourceOrdersSettlementStripSummary,
} from './source-orders-list-glance'

export type { SourceOrdersSettlementStripSummary }

/** @deprecated Prefer `buildSourceOrdersListGlance(orders).stripSummary`. */
export function summarizeSourceOrdersSettlementStrip(
  orders: readonly SourceOrderSummary[],
): SourceOrdersSettlementStripSummary {
  return buildSourceOrdersListGlance(orders).stripSummary
}
