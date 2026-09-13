import { SourceOrderDiscountType } from '../enums/source-order-discount-type.enum'
import {
  computeCollectionSettlementPreview,
  computeSourceOrderSettlementCents,
} from './compute-source-order-settlement'

describe('computeSourceOrderSettlementCents', () => {
  it('reproduces the #456 quote sample with clamped adjustments and lump-sum discount', () => {
    expect(
      computeSourceOrderSettlementCents({
        adultGuestCount: 8,
        childGuestCount: 2,
        adultUnitPriceCents: 680_000,
        childUnitPriceCents: 420_000,
        discountType: SourceOrderDiscountType.LUMP_SUM,
        discountCents: 200_000,
        fareAdjustments: [
          { direction: 'increase', amountCents: 60_000 },
          { direction: 'decrease', amountCents: 40_000 },
        ],
      }),
    ).toEqual({
      grossReceivableCents: 6_280_000,
      fareAdjustmentNetCents: 20_000,
      discountCents: 200_000,
      netReceivableCents: 6_100_000,
    })
  })

  it('clamps negative adjustment amounts to zero', () => {
    expect(
      computeSourceOrderSettlementCents({
        adultGuestCount: 1,
        childGuestCount: 0,
        adultUnitPriceCents: 100_000,
        discountType: SourceOrderDiscountType.NONE,
        discountCents: 0,
        fareAdjustments: [{ direction: 'increase', amountCents: -20_000 }],
      }),
    ).toEqual({
      grossReceivableCents: 100_000,
      fareAdjustmentNetCents: 0,
      discountCents: 0,
      netReceivableCents: 100_000,
    })
  })

  it('ignores discountCents unless discountType is lump_sum', () => {
    expect(
      computeSourceOrderSettlementCents({
        adultGuestCount: 8,
        childGuestCount: 2,
        adultUnitPriceCents: 680_000,
        childUnitPriceCents: 420_000,
        discountType: SourceOrderDiscountType.NONE,
        discountCents: 200_000,
        fareAdjustments: [
          { direction: 'increase', amountCents: 60_000 },
          { direction: 'decrease', amountCents: 40_000 },
        ],
      }),
    ).toEqual({
      grossReceivableCents: 6_280_000,
      fareAdjustmentNetCents: 20_000,
      discountCents: 0,
      netReceivableCents: 6_300_000,
    })
  })
})

describe('computeCollectionSettlementPreview', () => {
  it('reproduces the #456 collection previews for S=61000', () => {
    expect(computeCollectionSettlementPreview(6_100_000, 4_100_000)).toEqual({
      estimatedCustomerTopUpCents: 2_000_000,
      estimatedRebateCents: 0,
    })
    expect(computeCollectionSettlementPreview(6_100_000, 6_500_000)).toEqual({
      estimatedCustomerTopUpCents: 0,
      estimatedRebateCents: 400_000,
    })
  })
})
