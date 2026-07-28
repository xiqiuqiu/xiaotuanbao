import {
  FareAdjustmentDirection,
  FareAdjustmentKind,
  SourceOrderCollectionMode,
  SourceOrderDiscountType,
} from '@xiaotuanbao/shared'
import type { SourceOrderSummary } from '@/types/api'
import { describe, expect, it } from 'vitest'
import {
  computeCollectionSettlementPreview,
  computeFormAmounts,
  createEmptySourceOrderFormValues,
  formValuesToPayload,
  formatSourceOrderAmountSummary,
  sourceOrderToFormValues,
  totalGuestCount,
} from './source-order-form'

describe('computeFormAmounts', () => {
  it('computes gross receivable and guest_only G约定 from deposit+balance', () => {
    // 2 × 1200 + 1 × 800 = 3200 元 → 320000 分；G=定金+尾款
    expect(
      computeFormAmounts({
        adultGuestCount: 2,
        childGuestCount: 1,
        adultUnitPriceYuan: 1200,
        childUnitPriceYuan: 800,
        discountType: SourceOrderDiscountType.NONE,
        collectionMode: SourceOrderCollectionMode.GUEST_ONLY,
        depositYuan: 1000,
        balanceYuan: 2200,
      }),
    ).toMatchObject({
      grossReceivableCents: 320000,
      discountCents: 0,
      netReceivableCents: 320000,
      depositCents: 100000,
      balanceCents: 220000,
      partnerCollectedCents: 0,
      guestCollectCents: 320000,
      estimatedCustomerTopUpCents: 0,
      estimatedRebateCents: 0,
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
        depositYuan: 0,
        balanceYuan: 2400,
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
        depositYuan: 0,
        balanceYuan: 2400,
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
        depositYuan: 0,
        balanceYuan: 800,
      }).grossReceivableCents,
    ).toBe(80000)
  })

  it('derives split P=定金 and G约定=尾款 without forcing P+G=S', () => {
    // 2 × 1200 + 1 × 800 = 3200 元；优惠 200 元；定金 1000 → P；尾款 2000 → G
    expect(
      computeFormAmounts({
        adultGuestCount: 2,
        childGuestCount: 1,
        adultUnitPriceYuan: 1200,
        childUnitPriceYuan: 800,
        discountType: SourceOrderDiscountType.LUMP_SUM,
        discountYuan: 200,
        collectionMode: SourceOrderCollectionMode.SPLIT,
        depositYuan: 1000,
        balanceYuan: 2000,
        fareAdjustments: [],
      }),
    ).toMatchObject({
      grossReceivableCents: 320000,
      fareAdjustmentNetCents: 0,
      discountCents: 20000,
      netReceivableCents: 300000,
      depositCents: 100000,
      balanceCents: 200000,
      partnerCollectedCents: 100000,
      guestCollectCents: 200000,
      estimatedCustomerTopUpCents: 100000,
      estimatedRebateCents: 0,
    })
  })

  it('includes fare adjustments in settlement without forcing G=S−P', () => {
    // 原始 1000；单房差 +200；学生门票已优惠过 −50；优惠 50 → 结算 1100；定金 400；尾款 900
    expect(
      computeFormAmounts({
        adultGuestCount: 1,
        childGuestCount: 0,
        adultUnitPriceYuan: 1000,
        childUnitPriceYuan: 0,
        discountType: SourceOrderDiscountType.LUMP_SUM,
        discountYuan: 50,
        collectionMode: SourceOrderCollectionMode.SPLIT,
        depositYuan: 400,
        balanceYuan: 900,
        fareAdjustments: [
          {
            kind: FareAdjustmentKind.SINGLE_ROOM_SUPPLEMENT,
            direction: FareAdjustmentDirection.INCREASE,
            amountYuan: 200,
          },
          {
            kind: FareAdjustmentKind.STUDENT_TICKET_PRE_DISCOUNTED,
            direction: FareAdjustmentDirection.DECREASE,
            amountYuan: 50,
          },
        ],
      }),
    ).toMatchObject({
      grossReceivableCents: 100000,
      fareAdjustmentNetCents: 15000,
      discountCents: 5000,
      netReceivableCents: 110000,
      depositCents: 40000,
      balanceCents: 90000,
      partnerCollectedCents: 40000,
      guestCollectCents: 90000,
      estimatedCustomerTopUpCents: 20000,
      estimatedRebateCents: 0,
    })
  })
})

describe('computeCollectionSettlementPreview', () => {
  it.each([
    { g: 600000, topUp: 0, rebate: 100000 },
    { g: 100000, topUp: 400000, rebate: 0 },
    { g: 20000, topUp: 480000, rebate: 0 },
  ])('S=5000 G=$g → topUp=$topUp rebate=$rebate', ({ g, topUp, rebate }) => {
    expect(computeCollectionSettlementPreview(500000, g)).toEqual({
      estimatedCustomerTopUpCents: topUp,
      estimatedRebateCents: rebate,
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
      fareAdjustments: [],
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
      depositCents: 0,
      balanceCents: 320000,
      partnerCollectedCents: 0,
      guestCollectCents: 320000,
      settlementNotes: null,
      notes: '备注',
    } as SourceOrderSummary

    expect(sourceOrderToFormValues(order)).toMatchObject({
      partnerId: 'partner-1',
      adultGuestCount: 2,
      childGuestCount: 1,
      adultUnitPriceYuan: 1200,
      childUnitPriceYuan: 800,
      depositYuan: 0,
      balanceYuan: 3200,
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
      depositCents: 0,
      balanceCents: 300000,
      partnerCollectedCents: 0,
      guestCollectCents: 300000,
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
      depositCents: 0,
      balanceCents: 300000,
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
      depositCents: 100000,
      balanceCents: 620000,
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
      depositCents: 100000,
      balanceCents: 620000,
      partnerCollectedCents: 100000,
      guestCollectCents: 620000,
    })
    // Payload unit prices diverge from DB; API must treat matching path amounts as non-edit
    // (otherwise amountFieldsLocked notes-only save is rejected).
    expect(formValuesToPayload(values)).toMatchObject({
      adultUnitPriceCents: 720000,
      depositCents: 100000,
      balanceCents: 620000,
    })
  })
})

describe('formValuesToPayload', () => {
  it('sends adult/child counts, unit prices and installments in cents', () => {
    expect(
      formValuesToPayload({
        partnerId: 'partner-1',
        adultGuestCount: 2,
        childGuestCount: 1,
        adultUnitPriceYuan: 1200,
        childUnitPriceYuan: 800,
        discountType: SourceOrderDiscountType.NONE,
        collectionMode: SourceOrderCollectionMode.GUEST_ONLY,
        depositYuan: 1000,
        balanceYuan: 2200,
        fareAdjustments: [],
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
      depositCents: 100000,
      balanceCents: 220000,
      fareAdjustments: [],
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
        depositYuan: 0,
        balanceYuan: 2400,
        fareAdjustments: [],
      }),
    ).toMatchObject({
      adultGuestCount: 2,
      childGuestCount: 0,
      adultUnitPriceCents: 120000,
      childUnitPriceCents: 0,
    })
  })

  it('sends fare adjustments in cents with custom names', () => {
    expect(
      formValuesToPayload({
        partnerId: 'partner-1',
        adultGuestCount: 1,
        childGuestCount: 0,
        adultUnitPriceYuan: 1000,
        discountType: SourceOrderDiscountType.NONE,
        collectionMode: SourceOrderCollectionMode.GUEST_ONLY,
        depositYuan: 0,
        balanceYuan: 1000,
        fareAdjustments: [
          {
            kind: FareAdjustmentKind.SINGLE_ROOM_SUPPLEMENT,
            direction: FareAdjustmentDirection.INCREASE,
            amountYuan: 200,
          },
          {
            kind: FareAdjustmentKind.CUSTOM,
            direction: FareAdjustmentDirection.DECREASE,
            amountYuan: 50,
            customName: '不含首晚住宿',
          },
        ],
      }).fareAdjustments,
    ).toEqual([
      {
        kind: FareAdjustmentKind.SINGLE_ROOM_SUPPLEMENT,
        direction: FareAdjustmentDirection.INCREASE,
        amountCents: 20000,
        customName: null,
      },
      {
        kind: FareAdjustmentKind.CUSTOM,
        direction: FareAdjustmentDirection.DECREASE,
        amountCents: 5000,
        customName: '不含首晚住宿',
      },
    ])
  })
})

describe('formatSourceOrderAmountSummary', () => {
  const formatCents = (cents: number) => `¥${(cents / 100).toFixed(2)}`

  it('shows partitioned preview for 全部我方代收 including top-up/rebate', () => {
    const summary = formatSourceOrderAmountSummary(
      {
        collectionMode: SourceOrderCollectionMode.GUEST_ONLY,
        netReceivableCents: 500000,
        partnerCollectedCents: 0,
        guestCollectCents: 600000,
        estimatedCustomerTopUpCents: 0,
        estimatedRebateCents: 100000,
      },
      formatCents,
    )
    expect(summary).not.toContain('G约定')
    expect(summary).not.toContain('往来结果')
    expect(summary).not.toContain('【结算】')
    expect(summary).not.toContain('预估轧差')
    expect(summary).toBe(
      [
        '【客户结算】结算金额 ¥5000.00',
        '【代收约定】客户已收 ¥0.00 · 我方代收 ¥6000.00',
        '【预计结算差额】客户补款 ¥0.00 · 预计返利 ¥1000.00',
      ].join('\n'),
    )
  })

  it('shows partitioned preview for 客户收定金+我方收尾款', () => {
    expect(
      formatSourceOrderAmountSummary(
        {
          collectionMode: SourceOrderCollectionMode.SPLIT,
          netReceivableCents: 500000,
          partnerCollectedCents: 450000,
          guestCollectCents: 100000,
          estimatedCustomerTopUpCents: 400000,
          estimatedRebateCents: 0,
        },
        formatCents,
      ),
    ).toBe(
      [
        '【客户结算】结算金额 ¥5000.00',
        '【代收约定】客户已收 ¥4500.00 · 我方代收 ¥1000.00',
        '【预计结算差额】客户补款 ¥4000.00 · 预计返利 ¥0.00',
      ].join('\n'),
    )
  })

  it('shows S=5000 P=4500 G=200 top-up/rebate preview', () => {
    expect(
      formatSourceOrderAmountSummary(
        {
          collectionMode: SourceOrderCollectionMode.SPLIT,
          netReceivableCents: 500000,
          partnerCollectedCents: 450000,
          guestCollectCents: 20000,
          estimatedCustomerTopUpCents: 480000,
          estimatedRebateCents: 0,
        },
        formatCents,
      ),
    ).toBe(
      [
        '【客户结算】结算金额 ¥5000.00',
        '【代收约定】客户已收 ¥4500.00 · 我方代收 ¥200.00',
        '【预计结算差额】客户补款 ¥4800.00 · 预计返利 ¥0.00',
      ].join('\n'),
    )
  })

  it('shows partner-settled preview without collection settlement', () => {
    expect(
      formatSourceOrderAmountSummary(
        {
          collectionMode: SourceOrderCollectionMode.PARTNER_SETTLED,
          netReceivableCents: 399600,
          partnerCollectedCents: 399600,
          guestCollectCents: 0,
          estimatedCustomerTopUpCents: 399600,
          estimatedRebateCents: 0,
        },
        formatCents,
      ),
    ).toBe(
      [
        '【客户结算】结算金额 ¥3996.00',
        '【代收约定】客户已收 ¥3996.00（全部客户结算）',
        '【预计结算差额】无代收轧差',
      ].join('\n'),
    )
  })
})
