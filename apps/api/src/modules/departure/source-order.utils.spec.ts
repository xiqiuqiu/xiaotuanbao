import {
  computeSourceOrderAmounts,
  buildSourceOrderDisplayName,
  reconcileUnitPricesToGross,
  resolveSourceOrderAmountChange,
} from './source-order.utils'

describe('computeSourceOrderAmounts', () => {
  it('computes gross receivable from adult and child unit prices', () => {
    // 2 × 1200 + 1 × 800 = 3200 元 → 320000 分
    expect(
      computeSourceOrderAmounts({
        adultGuestCount: 2,
        childGuestCount: 1,
        adultUnitPriceCents: 120000,
        childUnitPriceCents: 80000,
        discountType: 'none',
        discountCents: 0,
        collectionMode: 'guest_only',
        partnerCollectedCents: 0,
      }),
    ).toEqual({
      grossReceivableCents: 320000,
      discountCents: 0,
      netReceivableCents: 320000,
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
        partnerCollectedCents: 0,
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
        partnerCollectedCents: 0,
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
        partnerCollectedCents: 0,
      }).grossReceivableCents,
    ).toBe(80000)
  })

  it('computes guest_only collection from adult/child gross', () => {
    expect(
      computeSourceOrderAmounts({
        adultGuestCount: 10,
        childGuestCount: 0,
        adultUnitPriceCents: 100000,
        childUnitPriceCents: 0,
        discountType: 'none',
        discountCents: 0,
        collectionMode: 'guest_only',
        partnerCollectedCents: 0,
      }),
    ).toEqual({
      grossReceivableCents: 1000000,
      discountCents: 0,
      netReceivableCents: 1000000,
      partnerCollectedCents: 0,
      guestCollectCents: 1000000,
    })
  })

  it('computes split collection from adult/child gross', () => {
    expect(
      computeSourceOrderAmounts({
        adultGuestCount: 5,
        childGuestCount: 0,
        adultUnitPriceCents: 200000,
        childUnitPriceCents: 0,
        discountType: 'lump_sum',
        discountCents: 50000,
        collectionMode: 'split',
        partnerCollectedCents: 300000,
      }),
    ).toEqual({
      grossReceivableCents: 1000000,
      discountCents: 50000,
      netReceivableCents: 950000,
      partnerCollectedCents: 300000,
      guestCollectCents: 650000,
    })
  })

  it('computes partner_settled collection from adult/child gross', () => {
    expect(
      computeSourceOrderAmounts({
        adultGuestCount: 2,
        childGuestCount: 0,
        adultUnitPriceCents: 50000,
        childUnitPriceCents: 0,
        discountType: 'none',
        discountCents: 0,
        collectionMode: 'partner_settled',
        partnerCollectedCents: 0,
      }),
    ).toEqual({
      grossReceivableCents: 100000,
      discountCents: 0,
      netReceivableCents: 100000,
      partnerCollectedCents: 100000,
      guestCollectCents: 0,
    })
  })

  it('applies discount and split against mixed adult/child gross', () => {
    // 2 × 1200 + 1 × 800 = 3200 元；优惠 200 元；客户已收 1000 元
    expect(
      computeSourceOrderAmounts({
        adultGuestCount: 2,
        childGuestCount: 1,
        adultUnitPriceCents: 120000,
        childUnitPriceCents: 80000,
        discountType: 'lump_sum',
        discountCents: 20000,
        collectionMode: 'split',
        partnerCollectedCents: 100000,
      }),
    ).toEqual({
      grossReceivableCents: 320000,
      discountCents: 20000,
      netReceivableCents: 300000,
      partnerCollectedCents: 100000,
      guestCollectCents: 200000,
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
    partnerCollectedCents: 100000,
    guestCollectCents: 620000,
    grossReceivableCents: 720000,
    netReceivableCents: 720000,
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
        partnerCollectedCents: 100000,
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
        partnerCollectedCents: 100000,
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
        partnerCollectedCents: 100000,
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
