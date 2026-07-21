import { PaymentScheduleSourceType } from '@xiaotuanbao/shared'
import { describe, expect, it } from 'vitest'
import {
  formatGuestCollectionSuggestionText,
  resolveGuestCollectionAmountSuggestion,
  shouldReplaceSuggestedAmount,
  sumExistingUnallocatedGuestCents,
} from './transaction-amount-suggestion'

function formatCents(cents: number) {
  return `¥${(cents / 100).toFixed(2)}`
}

describe('resolveGuestCollectionAmountSuggestion', () => {
  it('uses unsettled amount from open guest-collection schedule', () => {
    const result = resolveGuestCollectionAmountSuggestion({
      schedules: [
        {
          sourceType: PaymentScheduleSourceType.SOURCE_ORDER_GUEST_COLLECTION,
          amountCents: 500_00,
          unsettledAmountCents: 300_00,
          cancelledAt: null,
        },
      ],
      guestCollectCents: 500_00,
    })

    expect(result).toEqual({
      suggestedAmountCents: 300_00,
      hasSchedule: true,
      pathAmountCents: 500_00,
      agreedAmountCents: 500_00,
      existingUnallocatedCents: 0,
      settledHint: 'open',
    })
  })

  it('prefers open schedule over cancelled guest-collection schedule', () => {
    const result = resolveGuestCollectionAmountSuggestion({
      schedules: [
        {
          sourceType: PaymentScheduleSourceType.SOURCE_ORDER_GUEST_COLLECTION,
          amountCents: 500_00,
          unsettledAmountCents: 500_00,
          cancelledAt: '2026-01-01T00:00:00.000Z',
        },
        {
          sourceType: PaymentScheduleSourceType.SOURCE_ORDER_GUEST_COLLECTION,
          amountCents: 400_00,
          unsettledAmountCents: 100_00,
          cancelledAt: null,
        },
      ],
      guestCollectCents: 400_00,
    })

    expect(result.suggestedAmountCents).toBe(100_00)
    expect(result.pathAmountCents).toBe(400_00)
    expect(result.settledHint).toBe('open')
  })

  it('marks settled when open schedule unsettled is zero', () => {
    const result = resolveGuestCollectionAmountSuggestion({
      schedules: [
        {
          sourceType: PaymentScheduleSourceType.SOURCE_ORDER_GUEST_COLLECTION,
          amountCents: 500_00,
          unsettledAmountCents: 0,
          cancelledAt: null,
        },
      ],
      guestCollectCents: 500_00,
    })

    expect(result).toEqual({
      suggestedAmountCents: 0,
      hasSchedule: true,
      pathAmountCents: 500_00,
      agreedAmountCents: 500_00,
      existingUnallocatedCents: 0,
      settledHint: 'settled',
    })
  })

  it('falls back to path amount when no guest-collection schedule exists', () => {
    const result = resolveGuestCollectionAmountSuggestion({
      schedules: [
        {
          sourceType: PaymentScheduleSourceType.SOURCE_ORDER_CUSTOMER_SETTLEMENT,
          amountCents: 200_00,
          unsettledAmountCents: 200_00,
          cancelledAt: null,
        },
      ],
      guestCollectCents: 350_00,
    })

    expect(result).toEqual({
      suggestedAmountCents: 350_00,
      hasSchedule: false,
      agreedAmountCents: 350_00,
      existingUnallocatedCents: 0,
      settledHint: 'no_schedule',
    })
  })

  it('subtracts existing unallocated guest transactions from path fallback', () => {
    const result = resolveGuestCollectionAmountSuggestion({
      schedules: [],
      guestCollectCents: 500_00,
      existingUnallocatedGuestCents: 200_00,
    })

    expect(result).toEqual({
      suggestedAmountCents: 300_00,
      hasSchedule: false,
      agreedAmountCents: 500_00,
      existingUnallocatedCents: 200_00,
      settledHint: 'no_schedule',
    })
  })

  it('subtracts existing unallocated guest transactions from schedule unsettled', () => {
    const result = resolveGuestCollectionAmountSuggestion({
      schedules: [
        {
          sourceType: PaymentScheduleSourceType.SOURCE_ORDER_GUEST_COLLECTION,
          amountCents: 500_00,
          unsettledAmountCents: 300_00,
          cancelledAt: null,
        },
      ],
      guestCollectCents: 500_00,
      existingUnallocatedGuestCents: 200_00,
    })

    expect(result).toEqual({
      suggestedAmountCents: 100_00,
      hasSchedule: true,
      pathAmountCents: 500_00,
      agreedAmountCents: 500_00,
      existingUnallocatedCents: 200_00,
      settledHint: 'open',
    })
  })

  it('marks covered when existing unallocated already meets the reference amount', () => {
    const result = resolveGuestCollectionAmountSuggestion({
      schedules: [],
      guestCollectCents: 500_00,
      existingUnallocatedGuestCents: 500_00,
    })

    expect(result).toEqual({
      suggestedAmountCents: 0,
      hasSchedule: false,
      agreedAmountCents: 500_00,
      existingUnallocatedCents: 500_00,
      settledHint: 'covered',
    })
  })
})

describe('sumExistingUnallocatedGuestCents', () => {
  it('sums matching inflow guest txs and excludes the editing row', () => {
    const sum = sumExistingUnallocatedGuestCents({
      sourceOrderId: 'so-1',
      excludeTransactionId: 'tx-edit',
      transactions: [
        {
          id: 'tx-edit',
          direction: 'inflow',
          counterpartyType: 'guest',
          counterpartyId: 'so-1',
          voidedAt: null,
          unallocatedAmountCents: 100_00,
        },
        {
          id: 'tx-2',
          direction: 'inflow',
          counterpartyType: 'guest',
          counterpartyId: 'so-1',
          voidedAt: null,
          unallocatedAmountCents: 200_00,
        },
        {
          id: 'tx-partner',
          direction: 'inflow',
          counterpartyType: 'partner',
          counterpartyId: 'p-1',
          voidedAt: null,
          unallocatedAmountCents: 300_00,
        },
      ],
    })
    expect(sum).toBe(200_00)
  })
})

describe('formatGuestCollectionSuggestionText', () => {
  it('mentions remaining when existing unallocated reduces path fallback', () => {
    const text = formatGuestCollectionSuggestionText(
      {
        suggestedAmountCents: 300_00,
        hasSchedule: false,
        agreedAmountCents: 500_00,
        existingUnallocatedCents: 200_00,
        settledHint: 'no_schedule',
      },
      formatCents,
    )
    expect(text).toBe('尚未生成应收，参考剩余 ¥300.00')
  })

  it('explains covered by existing unallocated transactions', () => {
    const text = formatGuestCollectionSuggestionText(
      {
        suggestedAmountCents: 0,
        hasSchedule: false,
        agreedAmountCents: 500_00,
        existingUnallocatedCents: 500_00,
        settledHint: 'covered',
      },
      formatCents,
    )
    expect(text).toBe('已有未核销游客代收流水已覆盖参考金额')
  })
})

describe('shouldReplaceSuggestedAmount', () => {
  it('replaces when amount is empty', () => {
    expect(
      shouldReplaceSuggestedAmount({
        currentYuan: undefined,
        previousSuggestedYuan: 100,
      }),
    ).toBe(true)
  })

  it('replaces when amount still equals previous suggestion', () => {
    expect(
      shouldReplaceSuggestedAmount({
        currentYuan: 100,
        previousSuggestedYuan: 100,
      }),
    ).toBe(true)
  })

  it('keeps hand-edited amount', () => {
    expect(
      shouldReplaceSuggestedAmount({
        currentYuan: 80,
        previousSuggestedYuan: 100,
      }),
    ).toBe(false)
  })

  it('does not auto-replace when user never filled from suggestion', () => {
    expect(
      shouldReplaceSuggestedAmount({
        currentYuan: 80,
        previousSuggestedYuan: undefined,
      }),
    ).toBe(false)
  })
})
