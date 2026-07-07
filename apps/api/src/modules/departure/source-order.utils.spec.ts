import { computeSourceOrderAmounts, buildSourceOrderDisplayName } from './source-order.utils'

describe('computeSourceOrderAmounts', () => {
  it('computes guest_only collection', () => {
    expect(
      computeSourceOrderAmounts({
        guestCount: 10,
        unitPriceCents: 100000,
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

  it('computes split collection', () => {
    expect(
      computeSourceOrderAmounts({
        guestCount: 5,
        unitPriceCents: 200000,
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

  it('computes partner_settled collection', () => {
    expect(
      computeSourceOrderAmounts({
        guestCount: 2,
        unitPriceCents: 50000,
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
