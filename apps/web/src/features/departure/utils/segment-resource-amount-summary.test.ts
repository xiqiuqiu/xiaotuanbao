import { describe, expect, it } from 'vitest'
import { SegmentPayableStatus } from '@xiaotuanbao/shared'
import { summarizeSegmentResourceAmounts } from './segment-resource-amount-summary'

describe('summarizeSegmentResourceAmounts', () => {
  it('returns zeros when the segment has no resources', () => {
    expect(summarizeSegmentResourceAmounts([], { departureSettled: false })).toEqual({
      resourceCount: 0,
      resourceAmountCents: 0,
      ungeneratedPayableCents: 0,
      ungeneratedPayableCount: 0,
    })
  })

  it('sums agreed amounts and ungenerated payable gap for the current segment', () => {
    expect(
      summarizeSegmentResourceAmounts(
        [
          {
            amountCents: 220_000,
            payableStatus: SegmentPayableStatus.NOT_GENERATED,
          },
          {
            amountCents: 900_000,
            payableStatus: SegmentPayableStatus.NOT_GENERATED,
          },
        ],
        { departureSettled: false },
      ),
    ).toEqual({
      resourceCount: 2,
      resourceAmountCents: 1_120_000,
      ungeneratedPayableCents: 1_120_000,
      ungeneratedPayableCount: 2,
    })
  })

  it('excludes generated and closed resources from 尚未提交应付', () => {
    expect(
      summarizeSegmentResourceAmounts(
        [
          {
            amountCents: 220_000,
            payableStatus: SegmentPayableStatus.PENDING,
          },
          {
            amountCents: 900_000,
            payableStatus: SegmentPayableStatus.CLOSED,
          },
          {
            amountCents: 100_000,
            payableStatus: SegmentPayableStatus.NOT_GENERATED,
          },
        ],
        { departureSettled: false },
      ),
    ).toEqual({
      resourceCount: 3,
      resourceAmountCents: 1_220_000,
      ungeneratedPayableCents: 100_000,
      ungeneratedPayableCount: 1,
    })
  })

  it('does not count zero-amount ungenerated resources in 尚未提交应付', () => {
    expect(
      summarizeSegmentResourceAmounts(
        [
          {
            amountCents: 0,
            payableStatus: SegmentPayableStatus.NOT_GENERATED,
          },
          {
            amountCents: 50_000,
            payableStatus: SegmentPayableStatus.NOT_GENERATED,
          },
        ],
        { departureSettled: false },
      ),
    ).toEqual({
      resourceCount: 2,
      resourceAmountCents: 50_000,
      ungeneratedPayableCents: 50_000,
      ungeneratedPayableCount: 1,
    })
  })

  it('treats 尚未提交应付 as zero when the departure is settled', () => {
    expect(
      summarizeSegmentResourceAmounts(
        [
          {
            amountCents: 300_000,
            payableStatus: SegmentPayableStatus.NOT_GENERATED,
          },
        ],
        { departureSettled: true },
      ),
    ).toEqual({
      resourceCount: 1,
      resourceAmountCents: 300_000,
      ungeneratedPayableCents: 0,
      ungeneratedPayableCount: 0,
    })
  })
})
