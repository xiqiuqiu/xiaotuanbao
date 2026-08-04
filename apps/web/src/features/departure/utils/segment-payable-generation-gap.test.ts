import { describe, expect, it } from 'vitest'
import { countSegmentListPendingPayables, segmentPayableGenerationGap } from './segment-payable-generation-gap'

describe('segmentPayableGenerationGap', () => {
  it('hides when there are no resources', () => {
    expect(segmentPayableGenerationGap(0, 0)).toEqual({
      generated: 0,
      total: 0,
      ungenerated: 0,
      percent: 100,
      hasGap: false,
    })
  })

  it('hides when every resource has generated payables', () => {
    expect(segmentPayableGenerationGap(3, 3).hasGap).toBe(false)
  })

  it('shows ratio when some resources still lack payables', () => {
    expect(segmentPayableGenerationGap(1, 3)).toEqual({
      generated: 1,
      total: 3,
      ungenerated: 2,
      percent: 33,
      hasGap: true,
    })
  })

  it('shows empty ring when none generated yet', () => {
    expect(segmentPayableGenerationGap(0, 2)).toEqual({
      generated: 0,
      total: 2,
      ungenerated: 2,
      percent: 0,
      hasGap: true,
    })
  })
})

describe('countSegmentListPendingPayables', () => {
  it('sums ungenerated resources across segments', () => {
    expect(
      countSegmentListPendingPayables([
        { payableGeneratedCount: 0, resourceCount: 2 },
        { payableGeneratedCount: 1, resourceCount: 3 },
      ]),
    ).toBe(4)
  })
})
