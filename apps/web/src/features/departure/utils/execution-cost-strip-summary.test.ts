import { describe, expect, it } from 'vitest'
import { SegmentPayableStatus } from '@xiaotuanbao/shared'
import { summarizeExecutionCostStrip } from './execution-cost-strip-summary'

describe('summarizeExecutionCostStrip', () => {
  it('aggregates 成本合计 from departure + segment resource amounts', () => {
    expect(
      summarizeExecutionCostStrip(
        [
          {
            amountCents: 500_000,
            payableStatus: SegmentPayableStatus.PENDING,
          },
        ],
        [
          {
            amountCents: 300_000,
            payableStatus: SegmentPayableStatus.NOT_GENERATED,
          },
          {
            amountCents: 200_000,
            payableStatus: SegmentPayableStatus.PENDING,
          },
        ],
        { departureSettled: false },
      ),
    ).toEqual({
      totalCents: 1_000_000,
      totalCount: 3,
      departure: { resourceAmountCents: 500_000, resourceCount: 1 },
      segment: { resourceAmountCents: 500_000, resourceCount: 2 },
      ungeneratedCents: 300_000,
      ungeneratedCount: 1,
    })
  })

  it('counts only 未生成且金额>0 rows toward 尚未生成应付', () => {
    expect(
      summarizeExecutionCostStrip(
        [
          {
            amountCents: 0,
            payableStatus: SegmentPayableStatus.NOT_GENERATED,
          },
          {
            amountCents: 80_000,
            payableStatus: SegmentPayableStatus.NOT_GENERATED,
          },
        ],
        [
          {
            amountCents: 120_000,
            payableStatus: SegmentPayableStatus.CLOSED,
          },
        ],
        { departureSettled: false },
      ),
    ).toMatchObject({
      ungeneratedCents: 80_000,
      ungeneratedCount: 1,
    })
  })

  it('treats 尚未生成应付 as zero when the departure is settled', () => {
    expect(
      summarizeExecutionCostStrip(
        [
          {
            amountCents: 90_000,
            payableStatus: SegmentPayableStatus.NOT_GENERATED,
          },
        ],
        [
          {
            amountCents: 10_000,
            payableStatus: SegmentPayableStatus.NOT_GENERATED,
          },
        ],
        { departureSettled: true },
      ),
    ).toMatchObject({
      totalCents: 100_000,
      ungeneratedCents: 0,
      ungeneratedCount: 0,
    })
  })
})
