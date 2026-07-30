import { SegmentPayableStatus } from '@xiaotuanbao/shared'

/** Segment-scoped cost + ungenerated payable gap for the execution resource header. */
export interface SegmentResourceAmountSummary {
  resourceCount: number
  resourceAmountCents: number
  ungeneratedPayableCents: number
  /** Rows with 未生成且金额>0；与金额缺口同一口径。 */
  ungeneratedPayableCount: number
}

export type ResourceAmountRow = {
  amountCents: number
  payableStatus: string
}

/**
 * Mirrors departure overview Cost Total / 尚未生成应付, narrowed to one segment.
 * Uses resource agreed amounts only; closed counts as generated; voided returns to not_generated.
 */
export function summarizeSegmentResourceAmounts(
  resources: readonly ResourceAmountRow[],
  options: { departureSettled: boolean },
): SegmentResourceAmountSummary {
  let resourceAmountCents = 0
  let ungeneratedPayableCents = 0
  let ungeneratedPayableCount = 0

  for (const resource of resources) {
    resourceAmountCents += resource.amountCents
    if (
      !options.departureSettled &&
      resource.payableStatus === SegmentPayableStatus.NOT_GENERATED &&
      resource.amountCents > 0
    ) {
      ungeneratedPayableCents += resource.amountCents
      ungeneratedPayableCount += 1
    }
  }

  return {
    resourceCount: resources.length,
    resourceAmountCents,
    ungeneratedPayableCents,
    ungeneratedPayableCount,
  }
}
