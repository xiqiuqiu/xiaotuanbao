import {
  SourceOrderCollectionMode,
  SourceOrderDiscountType,
} from '@xiaotuanbao/shared'
import { describe, expect, it } from 'vitest'
import { computeFormAmounts } from './source-order-form'

describe('computeFormAmounts', () => {
  it('computes gross receivable from adult and child unit prices', () => {
    // 2 × 1200 + 1 × 800 = 3200 元 → 320000 分
    expect(
      computeFormAmounts({
        adultGuestCount: 2,
        childGuestCount: 1,
        adultUnitPriceYuan: 1200,
        childUnitPriceYuan: 800,
        discountType: SourceOrderDiscountType.NONE,
        collectionMode: SourceOrderCollectionMode.GUEST_ONLY,
      }),
    ).toMatchObject({
      grossReceivableCents: 320000,
      discountCents: 0,
      netReceivableCents: 320000,
      partnerCollectedCents: 0,
      guestCollectCents: 320000,
    })
  })

  it('treats unit price as 0 when that guest count is 0', () => {
    expect(
      computeFormAmounts({
        adultGuestCount: 2,
        childGuestCount: 0,
        adultUnitPriceYuan: 1200,
        childUnitPriceYuan: 9999,
        discountType: SourceOrderDiscountType.NONE,
        collectionMode: SourceOrderCollectionMode.GUEST_ONLY,
      }).grossReceivableCents,
    ).toBe(240000)
  })

  it('treats omitted unit price as 0 when that guest count is 0', () => {
    expect(
      computeFormAmounts({
        adultGuestCount: 2,
        childGuestCount: 0,
        adultUnitPriceYuan: 1200,
        discountType: SourceOrderDiscountType.NONE,
        collectionMode: SourceOrderCollectionMode.GUEST_ONLY,
      }).grossReceivableCents,
    ).toBe(240000)
  })

  it('allows zero unit price when guest count is positive', () => {
    expect(
      computeFormAmounts({
        adultGuestCount: 2,
        childGuestCount: 1,
        adultUnitPriceYuan: 0,
        childUnitPriceYuan: 800,
        discountType: SourceOrderDiscountType.NONE,
        collectionMode: SourceOrderCollectionMode.GUEST_ONLY,
      }).grossReceivableCents,
    ).toBe(80000)
  })

  it('applies discount and split against mixed adult/child gross', () => {
    // 2 × 1200 + 1 × 800 = 3200 元；优惠 200 元；客户已收 1000 元
    expect(
      computeFormAmounts({
        adultGuestCount: 2,
        childGuestCount: 1,
        adultUnitPriceYuan: 1200,
        childUnitPriceYuan: 800,
        discountType: SourceOrderDiscountType.LUMP_SUM,
        discountYuan: 200,
        collectionMode: SourceOrderCollectionMode.SPLIT,
        partnerCollectedYuan: 1000,
      }),
    ).toMatchObject({
      grossReceivableCents: 320000,
      discountCents: 20000,
      netReceivableCents: 300000,
      partnerCollectedCents: 100000,
      guestCollectCents: 200000,
    })
  })
})
