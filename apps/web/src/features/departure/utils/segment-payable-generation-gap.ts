/** Segment-level payable generation completeness for nav cards / batch CTA. */
export interface SegmentPayableGenerationGap {
  generated: number
  total: number
  ungenerated: number
  /** 0–100; 100 when total is 0 (nothing left to generate). */
  percent: number
  /** True only when at least one resource still lacks payables. */
  hasGap: boolean
}

export function segmentPayableGenerationGap(
  payableGeneratedCount: number,
  resourceCount: number,
): SegmentPayableGenerationGap {
  const generated = Math.max(0, Number(payableGeneratedCount) || 0)
  const total = Math.max(0, Number(resourceCount) || 0)
  const ungenerated = Math.max(0, total - generated)
  const percent = total === 0 ? 100 : Math.round((generated / total) * 100)

  return {
    generated,
    total,
    ungenerated,
    percent,
    hasGap: ungenerated > 0,
  }
}

/** 各日程段待提交应付资源项合计（与日程卡片 0/N 环同一口径）。 */
export function countSegmentListPendingPayables(
  segments: ReadonlyArray<{
    payableGeneratedCount: number
    resourceCount: number
  }>,
): number {
  return segments.reduce(
    (count, segment) =>
      count +
      segmentPayableGenerationGap(segment.payableGeneratedCount, segment.resourceCount)
        .ungenerated,
    0,
  )
}
