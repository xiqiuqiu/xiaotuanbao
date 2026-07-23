import { SegmentPayableStatus } from '@xiaotuanbao/shared'

/** Segment-scoped cost + ungenerated payable gap for the execution resource header. */
export interface SegmentResourceAmountSummary {
  resourceCount: number
  resourceAmountCents: number
  ungeneratedPayableCents: number
}

type ResourceAmountRow = {
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

  for (const resource of resources) {
    resourceAmountCents += resource.amountCents
    if (
      !options.departureSettled &&
      resource.payableStatus === SegmentPayableStatus.NOT_GENERATED &&
      resource.amountCents > 0
    ) {
      ungeneratedPayableCents += resource.amountCents
    }
  }

  return {
    resourceCount: resources.length,
    resourceAmountCents,
    ungeneratedPayableCents,
  }
}
