import {
  summarizeSegmentResourceAmounts,
  type ResourceAmountRow,
  type SegmentResourceAmountSummary,
} from './segment-resource-amount-summary'

/** Whole-trip cost glance for the execution workspace cost strip. */
export interface ExecutionCostStripSummary {
  totalCents: number
  totalCount: number
  departure: Pick<SegmentResourceAmountSummary, 'resourceAmountCents' | 'resourceCount'>
  segment: Pick<SegmentResourceAmountSummary, 'resourceAmountCents' | 'resourceCount'>
  ungeneratedCents: number
  ungeneratedCount: number
}

/**
 * Client-side Cost Total + 尚未提交应付 for execution layout.
 * Same row口径 as summarizeSegmentResourceAmounts (未生成且金额>0).
 */
export function summarizeExecutionCostStrip(
  departureResources: readonly ResourceAmountRow[],
  segmentResources: readonly ResourceAmountRow[],
  options: { departureSettled: boolean },
): ExecutionCostStripSummary {
  const departure = summarizeSegmentResourceAmounts(departureResources, options)
  const segment = summarizeSegmentResourceAmounts(segmentResources, options)

  return {
    totalCents: departure.resourceAmountCents + segment.resourceAmountCents,
    totalCount: departure.resourceCount + segment.resourceCount,
    departure: {
      resourceAmountCents: departure.resourceAmountCents,
      resourceCount: departure.resourceCount,
    },
    segment: {
      resourceAmountCents: segment.resourceAmountCents,
      resourceCount: segment.resourceCount,
    },
    ungeneratedCents:
      departure.ungeneratedPayableCents + segment.ungeneratedPayableCents,
    ungeneratedCount:
      departure.ungeneratedPayableCount + segment.ungeneratedPayableCount,
  }
}
