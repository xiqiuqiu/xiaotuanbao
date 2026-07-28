import {
  isResourcePayableSourceType,
  isSourceOrderConventionReceivableSourceType,
  isSourceOrderReceivableSourceType,
  PaymentScheduleSourceType,
  RESOURCE_PAYABLE_SOURCE_TYPES,
  SOURCE_ORDER_RECEIVABLE_SOURCE_TYPES,
  shouldCancelSourceOrderScheduleOnConventionSync,
} from './payment-schedule-source-type.enum'

describe('resource payable source types', () => {
  it('recognizes segment_resource and departure_resource as resource payables', () => {
    expect(isResourcePayableSourceType(PaymentScheduleSourceType.SEGMENT_RESOURCE)).toBe(true)
    expect(isResourcePayableSourceType(PaymentScheduleSourceType.DEPARTURE_RESOURCE)).toBe(true)
    expect(RESOURCE_PAYABLE_SOURCE_TYPES).toEqual([
      PaymentScheduleSourceType.SEGMENT_RESOURCE,
      PaymentScheduleSourceType.DEPARTURE_RESOURCE,
    ])
  })

  it('excludes manual and source-order schedule types', () => {
    expect(isResourcePayableSourceType(PaymentScheduleSourceType.MANUAL)).toBe(false)
    expect(
      isResourcePayableSourceType(PaymentScheduleSourceType.SOURCE_ORDER_CUSTOMER_SETTLEMENT),
    ).toBe(false)
    expect(isResourcePayableSourceType(PaymentScheduleSourceType.SOURCE_ORDER_REBATE)).toBe(false)
  })
})

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
