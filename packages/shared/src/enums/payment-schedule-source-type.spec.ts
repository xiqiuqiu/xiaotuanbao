import {
  isSourceOrderConventionReceivableSourceType,
  isSourceOrderReceivableSourceType,
  PaymentScheduleSourceType,
  SOURCE_ORDER_RECEIVABLE_SOURCE_TYPES,
  shouldCancelSourceOrderScheduleOnConventionSync,
} from './payment-schedule-source-type.enum'

describe('source-order receivable source types', () => {
  it('recognizes legacy guest_collection as already-generated receivable', () => {
    expect(
      isSourceOrderReceivableSourceType(
        PaymentScheduleSourceType.SOURCE_ORDER_GUEST_COLLECTION,
      ),
    ).toBe(true)
    expect(SOURCE_ORDER_RECEIVABLE_SOURCE_TYPES).toContain(
      PaymentScheduleSourceType.SOURCE_ORDER_GUEST_COLLECTION,
    )
  })

  it('does not treat legacy guest_collection as convention-managed', () => {
    expect(
      isSourceOrderConventionReceivableSourceType(
        PaymentScheduleSourceType.SOURCE_ORDER_GUEST_COLLECTION,
      ),
    ).toBe(false)
  })

  it('preserves active legacy schedules during convention sync', () => {
    expect(
      shouldCancelSourceOrderScheduleOnConventionSync({
        scheduleSourceType: PaymentScheduleSourceType.SOURCE_ORDER_GUEST_COLLECTION,
        expectedAmountCents: undefined,
      }),
    ).toBe(false)
  })

  it('cancels convention-managed paths that are no longer expected', () => {
    expect(
      shouldCancelSourceOrderScheduleOnConventionSync({
        scheduleSourceType:
          PaymentScheduleSourceType.SOURCE_ORDER_GUEST_DEPOSIT_COLLECTION,
        expectedAmountCents: undefined,
      }),
    ).toBe(true)

    expect(
      shouldCancelSourceOrderScheduleOnConventionSync({
        scheduleSourceType:
          PaymentScheduleSourceType.SOURCE_ORDER_GUEST_BALANCE_COLLECTION,
        expectedAmountCents: 0,
      }),
    ).toBe(true)
  })

  it('keeps convention-managed paths that still have positive expected amount', () => {
    expect(
      shouldCancelSourceOrderScheduleOnConventionSync({
        scheduleSourceType:
          PaymentScheduleSourceType.SOURCE_ORDER_GUEST_BALANCE_COLLECTION,
        expectedAmountCents: 700000,
      }),
    ).toBe(false)
  })
})
