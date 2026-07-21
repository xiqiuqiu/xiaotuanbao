import {
  didSourceAmountPathChange,
  isEligibleForSourceAmountChangeMark,
} from './source-amount-change'

describe('didSourceAmountPathChange', () => {
  it('is false when both path amounts are unchanged', () => {
    expect(
      didSourceAmountPathChange(
        { guestCollectCents: 50000, partnerCollectedCents: 0 },
        { guestCollectCents: 50000, partnerCollectedCents: 0 },
      ),
    ).toBe(false)
  })

  it('is true when guestCollect changes', () => {
    expect(
      didSourceAmountPathChange(
        { guestCollectCents: 50000, partnerCollectedCents: 0 },
        { guestCollectCents: 30000, partnerCollectedCents: 0 },
      ),
    ).toBe(true)
  })

  it('is true when partnerCollected changes', () => {
    expect(
      didSourceAmountPathChange(
        { guestCollectCents: 20000, partnerCollectedCents: 30000 },
        { guestCollectCents: 20000, partnerCollectedCents: 25000 },
      ),
    ).toBe(true)
  })
})

describe('isEligibleForSourceAmountChangeMark', () => {
  const changeAt = '2026-07-21T10:00:00.000Z'

  it('is true for open unallocated transaction created before change', () => {
    expect(
      isEligibleForSourceAmountChangeMark({
        voidedAt: null,
        unallocatedAmountCents: 10000,
        createdAt: '2026-07-21T09:00:00.000Z',
        changeAt,
      }),
    ).toBe(true)
  })

  it('is false when fully allocated', () => {
    expect(
      isEligibleForSourceAmountChangeMark({
        voidedAt: null,
        unallocatedAmountCents: 0,
        createdAt: '2026-07-21T09:00:00.000Z',
        changeAt,
      }),
    ).toBe(false)
  })

  it('is false when voided', () => {
    expect(
      isEligibleForSourceAmountChangeMark({
        voidedAt: '2026-07-21T09:30:00.000Z',
        unallocatedAmountCents: 10000,
        createdAt: '2026-07-21T09:00:00.000Z',
        changeAt,
      }),
    ).toBe(false)
  })

  it('is false when created at or after the change', () => {
    expect(
      isEligibleForSourceAmountChangeMark({
        voidedAt: null,
        unallocatedAmountCents: 10000,
        createdAt: changeAt,
        changeAt,
      }),
    ).toBe(false)
    expect(
      isEligibleForSourceAmountChangeMark({
        voidedAt: null,
        unallocatedAmountCents: 10000,
        createdAt: '2026-07-21T11:00:00.000Z',
        changeAt,
      }),
    ).toBe(false)
  })
})
