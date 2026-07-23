import {
  SourceOrderCollectionMode,
  SourceOrderDiscountType,
} from '@xiaotuanbao/shared'
import type { SourceOrderSummary } from '@/types/api'
import { describe, expect, it } from 'vitest'
import {
  computeFormAmounts,
  createEmptySourceOrderFormValues,
  formValuesToPayload,
  formatSourceOrderAmountSummary,
  sourceOrderToFormValues,
  totalGuestCount,
} from './source-order-form'

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

describe('createEmptySourceOrderFormValues', () => {
  it('defaults adult and child guest counts to 0', () => {
    expect(createEmptySourceOrderFormValues()).toMatchObject({
      adultGuestCount: 0,
      childGuestCount: 0,
      discountType: SourceOrderDiscountType.NONE,
      collectionMode: SourceOrderCollectionMode.GUEST_ONLY,
    })
  })
})

describe('totalGuestCount', () => {
  it('sums adult and child guest counts', () => {
    expect(totalGuestCount({ adultGuestCount: 2, childGuestCount: 1 })).toBe(3)
  })

  it('treats missing counts as 0', () => {
    expect(totalGuestCount({})).toBe(0)
    expect(totalGuestCount({ adultGuestCount: 2 })).toBe(2)
  })
})

describe('sourceOrderToFormValues', () => {
  it('maps adult/child counts and unit prices from API summary', () => {
    const order = {
      partnerId: 'partner-1',
      guestCount: 3,
      adultGuestCount: 2,
      childGuestCount: 1,
      adultUnitPriceCents: 120000,
      childUnitPriceCents: 80000,
      grossReceivableCents: 320000,
      discountType: SourceOrderDiscountType.NONE,
      discountCents: 0,
      discountNotes: null,
      collectionMode: SourceOrderCollectionMode.GUEST_ONLY,
      partnerCollectedCents: 0,
      settlementNotes: null,
      notes: '备注',
    } as SourceOrderSummary

    expect(sourceOrderToFormValues(order)).toMatchObject({
      partnerId: 'partner-1',
      adultGuestCount: 2,
      childGuestCount: 1,
      adultUnitPriceYuan: 1200,
      childUnitPriceYuan: 800,
      notes: '备注',
    })
  })

  it('preserves legacy all-adult mapping amounts until user edits', () => {
    // 迁移后：3 人全成人、单价 1000 元 → 原始应收 3000 元
    const order = {
      partnerId: 'partner-1',
      guestCount: 3,
      adultGuestCount: 3,
      childGuestCount: 0,
      adultUnitPriceCents: 100000,
      childUnitPriceCents: 0,
      grossReceivableCents: 300000,
      discountType: SourceOrderDiscountType.NONE,
      discountCents: 0,
      discountNotes: null,
      collectionMode: SourceOrderCollectionMode.GUEST_ONLY,
      partnerCollectedCents: 0,
      settlementNotes: null,
      notes: null,
    } as SourceOrderSummary

    const values = sourceOrderToFormValues(order)
    expect(values).toMatchObject({
      adultGuestCount: 3,
      childGuestCount: 0,
      adultUnitPriceYuan: 1000,
      childUnitPriceYuan: 0,
    })
    expect(computeFormAmounts(values).grossReceivableCents).toBe(300000)
    expect(formValuesToPayload(values)).toMatchObject({
      adultGuestCount: 3,
      childGuestCount: 0,
      adultUnitPriceCents: 100000,
      childUnitPriceCents: 0,
    })
  })

  it('reconciles unit price when stored gross diverges after receivable path sync', () => {
    const order = {
      partnerId: 'partner-1',
      guestCount: 1,
      adultGuestCount: 1,
      childGuestCount: 0,
      adultUnitPriceCents: 700000,
      childUnitPriceCents: 0,
      grossReceivableCents: 720000,
      netReceivableCents: 720000,
      discountType: SourceOrderDiscountType.NONE,
      discountCents: 0,
      discountNotes: null,
      collectionMode: SourceOrderCollectionMode.SPLIT,
      partnerCollectedCents: 100000,
      guestCollectCents: 620000,
      settlementNotes: null,
      notes: null,
    } as SourceOrderSummary

    const values = sourceOrderToFormValues(order)
    expect(values.adultUnitPriceYuan).toBe(7200)
    expect(computeFormAmounts(values)).toMatchObject({
      grossReceivableCents: 720000,
      netReceivableCents: 720000,
      partnerCollectedCents: 100000,
      guestCollectCents: 620000,
    })
  })
})

describe('formValuesToPayload', () => {
  it('sends adult/child counts and unit prices in cents', () => {
    expect(
      formValuesToPayload({
        partnerId: 'partner-1',
        adultGuestCount: 2,
        childGuestCount: 1,
        adultUnitPriceYuan: 1200,
        childUnitPriceYuan: 800,
        discountType: SourceOrderDiscountType.NONE,
        collectionMode: SourceOrderCollectionMode.GUEST_ONLY,
      }),
    ).toMatchObject({
      partnerId: 'partner-1',
      adultGuestCount: 2,
      childGuestCount: 1,
      adultUnitPriceCents: 120000,
      childUnitPriceCents: 80000,
      discountType: SourceOrderDiscountType.NONE,
      discountCents: 0,
      collectionMode: SourceOrderCollectionMode.GUEST_ONLY,
      partnerCollectedCents: 0,
    })
  })

  it('sends 0 unit price cents when that guest count is 0', () => {
    expect(
      formValuesToPayload({
        partnerId: 'partner-1',
        adultGuestCount: 2,
        childGuestCount: 0,
        adultUnitPriceYuan: 1200,
        childUnitPriceYuan: 9999,
        discountType: SourceOrderDiscountType.NONE,
        collectionMode: SourceOrderCollectionMode.GUEST_ONLY,
      }),
    ).toMatchObject({
      adultGuestCount: 2,
      childGuestCount: 0,
      adultUnitPriceCents: 120000,
      childUnitPriceCents: 0,
    })
  })
})

describe('formatSourceOrderAmountSummary', () => {
  const formatCents = (cents: number) => `¥${(cents / 100).toFixed(2)}`
  const amounts = {
    grossReceivableCents: 399600,
    discountCents: 0,
    netReceivableCents: 399600,
    partnerCollectedCents: 50000,
    guestCollectCents: 349600,
  }

  it('shows settlement and guest collect for 全部我方代收', () => {
    expect(
      formatSourceOrderAmountSummary(
        { ...amounts, partnerCollectedCents: 0, guestCollectCents: 399600 },
        SourceOrderCollectionMode.GUEST_ONLY,
        formatCents,
      ),
    ).toBe('结算金额 ¥3996.00 · 我方代收 ¥3996.00')
  })

  it('shows settlement, partner collected and guest collect for 客户已收 + 我方代收', () => {
    expect(
      formatSourceOrderAmountSummary(
        amounts,
        SourceOrderCollectionMode.SPLIT,
        formatCents,
      ),
    ).toBe('结算金额 ¥3996.00 · 客户已收 ¥500.00 · 我方代收 ¥3496.00')
  })

  it('shows settlement and partner collected for 客户结算', () => {
    expect(
      formatSourceOrderAmountSummary(
        { ...amounts, partnerCollectedCents: 399600, guestCollectCents: 0 },
        SourceOrderCollectionMode.PARTNER_SETTLED,
        formatCents,
      ),
    ).toBe('结算金额 ¥3996.00 · 客户已收 ¥3996.00')
  })
})
