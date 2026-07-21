import { PaymentScheduleSourceType } from '@xiaotuanbao/shared'
import { describe, expect, it } from 'vitest'
import {
  resolveGuestCollectionAmountSuggestion,
  shouldReplaceSuggestedAmount,
} from './transaction-amount-suggestion'

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
      settledHint: 'no_schedule',
    })
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
