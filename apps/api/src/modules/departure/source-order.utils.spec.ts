import {
  computeCollectionSettlementPreview,
  computeSourceOrderAmounts,
  buildSourceOrderDisplayName,
  reconcileUnitPricesToGross,
  resolveSourceOrderAmountChange,
} from './source-order.utils'

describe('computeSourceOrderAmounts', () => {
  it('computes gross receivable from adult and child unit prices', () => {
    // 2 × 1200 + 1 × 800 = 3200 元 → 320000 分；全部我方代收：G约定=定金+尾款
    expect(
      computeSourceOrderAmounts({
        adultGuestCount: 2,
        childGuestCount: 1,
        adultUnitPriceCents: 120000,
        childUnitPriceCents: 80000,
        discountType: 'none',
        discountCents: 0,
        collectionMode: 'guest_only',
        depositCents: 100000,
        balanceCents: 220000,
      }),
    ).toEqual({
      grossReceivableCents: 320000,
      fareAdjustmentNetCents: 0,
      discountCents: 0,
      netReceivableCents: 320000,
      depositCents: 100000,
      balanceCents: 220000,
      partnerCollectedCents: 0,
      guestCollectCents: 320000,
    })
  })

  it('treats unit price as 0 when that guest count is 0', () => {
    expect(
      computeSourceOrderAmounts({
        adultGuestCount: 2,
        childGuestCount: 0,
        adultUnitPriceCents: 120000,
        childUnitPriceCents: 999999,
        discountType: 'none',
        discountCents: 0,
        collectionMode: 'guest_only',
        depositCents: 0,
        balanceCents: 240000,
      }).grossReceivableCents,
    ).toBe(240000)
  })

  it('treats omitted unit price as 0 when that guest count is 0', () => {
    expect(
      computeSourceOrderAmounts({
        adultGuestCount: 2,
        childGuestCount: 0,
        adultUnitPriceCents: 120000,
        childUnitPriceCents: undefined,
        discountType: 'none',
        discountCents: 0,
        collectionMode: 'guest_only',
        depositCents: 0,
        balanceCents: 240000,
      }).grossReceivableCents,
    ).toBe(240000)
  })

  it('allows zero unit price when guest count is positive', () => {
    expect(
      computeSourceOrderAmounts({
        adultGuestCount: 2,
        childGuestCount: 1,
        adultUnitPriceCents: 0,
        childUnitPriceCents: 80000,
        discountType: 'none',
        discountCents: 0,
        collectionMode: 'guest_only',
        depositCents: 0,
        balanceCents: 80000,
      }).grossReceivableCents,
    ).toBe(80000)
  })

  it('derives guest_only P=0 and G约定=定金+尾款 (may differ from S)', () => {
    expect(
      computeSourceOrderAmounts({
        adultGuestCount: 10,
        childGuestCount: 0,
        adultUnitPriceCents: 100000,
        childUnitPriceCents: 0,
        discountType: 'none',
        discountCents: 0,
        collectionMode: 'guest_only',
        depositCents: 200000,
        balanceCents: 900000,
      }),
    ).toEqual({
      grossReceivableCents: 1000000,
      fareAdjustmentNetCents: 0,
      discountCents: 0,
      netReceivableCents: 1000000,
      depositCents: 200000,
      balanceCents: 900000,
      partnerCollectedCents: 0,
      guestCollectCents: 1100000,
    })
  })

  it('allows guest_only with one installment zero when the other is positive', () => {
    expect(
      computeSourceOrderAmounts({
        adultGuestCount: 1,
        childGuestCount: 0,
        adultUnitPriceCents: 500000,
        childUnitPriceCents: 0,
        discountType: 'none',
        discountCents: 0,
        collectionMode: 'guest_only',
        depositCents: 0,
        balanceCents: 500000,
      }),
    ).toMatchObject({
      depositCents: 0,
      balanceCents: 500000,
      partnerCollectedCents: 0,
      guestCollectCents: 500000,
    })
  })

  it('derives split P=定金 and G约定=尾款 (not S−P)', () => {
    expect(
      computeSourceOrderAmounts({
        adultGuestCount: 5,
        childGuestCount: 0,
        adultUnitPriceCents: 200000,
        childUnitPriceCents: 0,
        discountType: 'lump_sum',
        discountCents: 50000,
        collectionMode: 'split',
        depositCents: 300000,
        balanceCents: 400000,
      }),
    ).toEqual({
      grossReceivableCents: 1000000,
      fareAdjustmentNetCents: 0,
      discountCents: 50000,
      netReceivableCents: 950000,
      depositCents: 300000,
      balanceCents: 400000,
      partnerCollectedCents: 300000,
      guestCollectCents: 400000,
    })
  })

  it('computes partner_settled with P=S, G=0 and clears installments', () => {
    expect(
      computeSourceOrderAmounts({
        adultGuestCount: 2,
        childGuestCount: 0,
        adultUnitPriceCents: 50000,
        childUnitPriceCents: 0,
        discountType: 'none',
        discountCents: 0,
        collectionMode: 'partner_settled',
        depositCents: 999,
        balanceCents: 999,
      }),
    ).toEqual({
      grossReceivableCents: 100000,
      fareAdjustmentNetCents: 0,
      discountCents: 0,
      netReceivableCents: 100000,
      depositCents: 0,
      balanceCents: 0,
      partnerCollectedCents: 100000,
      guestCollectCents: 0,
    })
  })

  it('applies discount and split from deposit/balance installments', () => {
    // 2 × 1200 + 1 × 800 = 3200 元；优惠 200 元；定金 1000 → P；尾款 2000 → G
    expect(
      computeSourceOrderAmounts({
        adultGuestCount: 2,
        childGuestCount: 1,
        adultUnitPriceCents: 120000,
        childUnitPriceCents: 80000,
        discountType: 'lump_sum',
        discountCents: 20000,
        collectionMode: 'split',
        depositCents: 100000,
        balanceCents: 200000,
      }),
    ).toEqual({
      grossReceivableCents: 320000,
      fareAdjustmentNetCents: 0,
      discountCents: 20000,
      netReceivableCents: 300000,
      depositCents: 100000,
      balanceCents: 200000,
      partnerCollectedCents: 100000,
      guestCollectCents: 200000,
    })
  })

  it('adds increase adjustments into settlement without forcing G=S−P', () => {
    // 原始 1000；单房差 +200；结算 1200；定金 400 → P；尾款 900 → G（可大于/小于 S−P）
    expect(
      computeSourceOrderAmounts({
        adultGuestCount: 1,
        childGuestCount: 0,
        adultUnitPriceCents: 100000,
        childUnitPriceCents: 0,
        discountType: 'none',
        discountCents: 0,
        collectionMode: 'split',
        depositCents: 40000,
        balanceCents: 90000,
        fareAdjustments: [
          {
            kind: 'single_room_supplement',
            direction: 'increase',
            amountCents: 20000,
          },
        ],
      }),
    ).toEqual({
      grossReceivableCents: 100000,
      fareAdjustmentNetCents: 20000,
      discountCents: 0,
      netReceivableCents: 120000,
      depositCents: 40000,
      balanceCents: 90000,
      partnerCollectedCents: 40000,
      guestCollectCents: 90000,
    })
  })

  it('nets decrease adjustments against increases and lump-sum discount', () => {
    // 原始 1000；续住 +300；学生门票已优惠过 −100；整单优惠 50 → 结算 1150；G=定金+尾款
    expect(
      computeSourceOrderAmounts({
        adultGuestCount: 1,
        childGuestCount: 0,
        adultUnitPriceCents: 100000,
        childUnitPriceCents: 0,
        discountType: 'lump_sum',
        discountCents: 5000,
        collectionMode: 'guest_only',
        depositCents: 50000,
        balanceCents: 65000,
        fareAdjustments: [
          {
            kind: 'extended_stay',
            direction: 'increase',
            amountCents: 30000,
          },
          {
            kind: 'student_ticket_pre_discounted',
            direction: 'decrease',
            amountCents: 10000,
          },
        ],
      }),
    ).toEqual({
      grossReceivableCents: 100000,
      fareAdjustmentNetCents: 20000,
      discountCents: 5000,
      netReceivableCents: 115000,
      depositCents: 50000,
      balanceCents: 65000,
      partnerCollectedCents: 0,
      guestCollectCents: 115000,
    })
  })

  it('treats omitted fare adjustments as zero net', () => {
    expect(
      computeSourceOrderAmounts({
        adultGuestCount: 1,
        childGuestCount: 0,
        adultUnitPriceCents: 50000,
        childUnitPriceCents: 0,
        discountType: 'none',
        discountCents: 0,
        collectionMode: 'partner_settled',
        depositCents: 0,
        balanceCents: 0,
      }),
    ).toMatchObject({
      fareAdjustmentNetCents: 0,
      netReceivableCents: 50000,
      depositCents: 0,
      balanceCents: 0,
      partnerCollectedCents: 50000,
      guestCollectCents: 0,
    })
  })
})

describe('computeCollectionSettlementPreview', () => {
  // ADR-0033 验收例：S=5000；补款=max(0,S−G)；返利=max(0,G−S)；P 不进公式
  it.each([
    { p: 20000, g: 600000, topUp: 0, rebate: 100000 },
    { p: 450000, g: 100000, topUp: 400000, rebate: 0 },
    { p: 450000, g: 20000, topUp: 480000, rebate: 0 },
  ])(
    'S=5000 with P=$p G=$g → topUp=$topUp rebate=$rebate',
    ({ g, topUp, rebate }) => {
      expect(computeCollectionSettlementPreview(500000, g)).toEqual({
        estimatedCustomerTopUpCents: topUp,
        estimatedRebateCents: rebate,
      })
    },
  )

  it('allows P greater than S without changing top-up/rebate', () => {
    expect(computeCollectionSettlementPreview(500000, 100000)).toEqual({
      estimatedCustomerTopUpCents: 400000,
      estimatedRebateCents: 0,
    })
  })
})

describe('reconcileUnitPricesToGross', () => {
  it('rewrites adult unit price when stored gross diverges after path sync', () => {
    expect(
      reconcileUnitPricesToGross({
        adultGuestCount: 1,
        childGuestCount: 0,
        adultUnitPriceCents: 700000,
        childUnitPriceCents: 0,
        grossReceivableCents: 720000,
      }),
    ).toEqual({
      adultUnitPriceCents: 720000,
      childUnitPriceCents: 0,
    })
  })

  it('keeps unit prices when they already match gross', () => {
    expect(
      reconcileUnitPricesToGross({
        adultGuestCount: 2,
        childGuestCount: 1,
        adultUnitPriceCents: 120000,
        childUnitPriceCents: 80000,
        grossReceivableCents: 320000,
      }),
    ).toEqual({
      adultUnitPriceCents: 120000,
      childUnitPriceCents: 80000,
    })
  })
})

describe('resolveSourceOrderAmountChange', () => {
  const postPathSyncOrder = {
    adultGuestCount: 1,
    childGuestCount: 0,
    adultUnitPriceCents: 700000,
    childUnitPriceCents: 0,
    discountType: 'none' as const,
    discountCents: 0,
    collectionMode: 'split' as const,
    depositCents: 100000,
    balanceCents: 620000,
    partnerCollectedCents: 100000,
    guestCollectCents: 620000,
    grossReceivableCents: 720000,
    fareAdjustmentNetCents: 0,
    netReceivableCents: 720000,
    fareAdjustments: [],
  }

  it('treats reconciled unit prices that match stored path amounts as no outcome change', () => {
    // Drawer sourceOrderToFormValues heals 7000→7200 for preview; save must not look locked.
    expect(
      resolveSourceOrderAmountChange(postPathSyncOrder, {
        adultGuestCount: 1,
        childGuestCount: 0,
        adultUnitPriceCents: 720000,
        childUnitPriceCents: 0,
        discountType: 'none',
        discountCents: 0,
        collectionMode: 'split',
        depositCents: 100000,
        balanceCents: 620000,
      }),
    ).toEqual({
      amountInputsChanged: true,
      amountOutcomeChanged: false,
    })
  })

  it('treats notes-only (identical amount inputs) as no change even when unit prices are stale', () => {
    expect(
      resolveSourceOrderAmountChange(postPathSyncOrder, {
        adultGuestCount: 1,
        childGuestCount: 0,
        adultUnitPriceCents: 700000,
        childUnitPriceCents: 0,
        discountType: 'none',
        discountCents: 0,
        collectionMode: 'split',
        depositCents: 100000,
        balanceCents: 620000,
      }),
    ).toEqual({
      amountInputsChanged: false,
      amountOutcomeChanged: false,
    })
  })

  it('flags a real unit-price change that alters gross as an outcome change', () => {
    expect(
      resolveSourceOrderAmountChange(postPathSyncOrder, {
        adultGuestCount: 1,
        childGuestCount: 0,
        adultUnitPriceCents: 800000,
        childUnitPriceCents: 0,
        discountType: 'none',
        discountCents: 0,
        collectionMode: 'split',
        depositCents: 100000,
        balanceCents: 620000,
      }),
    ).toEqual({
      amountInputsChanged: true,
      amountOutcomeChanged: true,
    })
  })

  it('flags fare-adjustment edits that change settlement as an outcome change', () => {
    expect(
      resolveSourceOrderAmountChange(postPathSyncOrder, {
        adultGuestCount: 1,
        childGuestCount: 0,
        adultUnitPriceCents: 720000,
        childUnitPriceCents: 0,
        discountType: 'none',
        discountCents: 0,
        collectionMode: 'split',
        depositCents: 100000,
        balanceCents: 620000,
        fareAdjustments: [
          {
            kind: 'single_room_supplement',
            direction: 'increase',
            amountCents: 10000,
          },
        ],
      }),
    ).toEqual({
      amountInputsChanged: true,
      amountOutcomeChanged: true,
    })
  })

  it('flags fare-adjustment line swaps with the same net as an outcome change', () => {
    const withSingleRoom = {
      ...postPathSyncOrder,
      fareAdjustmentNetCents: 20000,
      netReceivableCents: 740000,
      guestCollectCents: 640000,
      balanceCents: 640000,
      fareAdjustments: [
        {
          kind: 'single_room_supplement',
          direction: 'increase' as const,
          amountCents: 20000,
        },
      ],
    }

    expect(
      resolveSourceOrderAmountChange(withSingleRoom, {
        adultGuestCount: 1,
        childGuestCount: 0,
        adultUnitPriceCents: 720000,
        childUnitPriceCents: 0,
        discountType: 'none',
        discountCents: 0,
        collectionMode: 'split',
        depositCents: 100000,
        balanceCents: 640000,
        fareAdjustments: [
          {
            kind: 'extended_stay',
            direction: 'increase',
            amountCents: 20000,
          },
        ],
      }),
    ).toEqual({
      amountInputsChanged: true,
      amountOutcomeChanged: true,
    })
  })
})

describe('buildSourceOrderDisplayName', () => {
  it('uses partner name only (no departure-date suffix)', () => {
    // 发团详情页顶栏已有出团日期；客源单展示名再拼「X月X日发客」会重复干扰（应收客源单列同此名）
    expect(buildSourceOrderDisplayName('思达典雅', 1)).toBe('思达典雅')
    expect(buildSourceOrderDisplayName('西安某旅行社', 1)).toBe('西安某旅行社')
  })

  it('appends sequence for duplicates', () => {
    expect(buildSourceOrderDisplayName('西安某旅行社', 2)).toBe('西安某旅行社 2')
  })
})
