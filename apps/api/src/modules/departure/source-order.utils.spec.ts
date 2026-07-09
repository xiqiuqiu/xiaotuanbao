import { computeSourceOrderAmounts, buildSourceOrderDisplayName } from './source-order.utils'

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

describe('buildSourceOrderDisplayName', () => {
  it('builds base name without sequence', () => {
    expect(
      buildSourceOrderDisplayName('西安某旅行社', new Date('2026-07-01T00:00:00.000Z'), 1),
    ).toBe('西安某旅行社 7月1日发客')
  })

  it('appends sequence for duplicates', () => {
    expect(
      buildSourceOrderDisplayName('西安某旅行社', new Date('2026-07-01T00:00:00.000Z'), 2),
    ).toBe('西安某旅行社 7月1日发客 2')
  })
})
