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
