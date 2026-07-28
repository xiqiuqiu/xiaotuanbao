import { describe, expect, it } from 'vitest'
import {
  DepartureStatus,
  PaymentScheduleDirection,
  PaymentScheduleSourceType,
  PaymentScheduleStatus,
  type PaymentScheduleSummary,
} from '@xiaotuanbao/shared'
import { canAdjustScheduleAmount } from './payment-schedule-table-columns'

function schedule(overrides: Partial<PaymentScheduleSummary> = {}): PaymentScheduleSummary {
  return {
    id: 'sch-1',
    departureId: 'dep-1',
    departureStatus: DepartureStatus.PENDING_SETTLEMENT,
    direction: PaymentScheduleDirection.PAYABLE,
    scheduleNo: 'AP2026070001',
    title: '用车',
    amountCents: 1000000,
    dueDate: '2026-08-01',
    counterpartyType: 'supplier',
    counterpartyId: 'sup-1',
    counterpartyName: '车队',
    sourceType: PaymentScheduleSourceType.SEGMENT_RESOURCE,
    sourceId: 'res-1',
    status: PaymentScheduleStatus.PENDING,
    financeTouched: true,
    settledAmountCents: 0,
    unsettledAmountCents: 1000000,
    cancelledAt: null,
    cancelledBy: null,
    closeDisposition: null,
    cancelReason: null,
    amountAdjustedAt: null,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('canAdjustScheduleAmount', () => {
  it('shows adjust for open finance-touched resource payables with zero settlement', () => {
    expect(canAdjustScheduleAmount(schedule(), false)).toBe(true)
    expect(canAdjustScheduleAmount(schedule({ settledAmountCents: 100 }), false)).toBe(false)
    expect(
      canAdjustScheduleAmount(schedule({ status: PaymentScheduleStatus.CANCELLED }), false),
    ).toBe(false)
    expect(canAdjustScheduleAmount(schedule({ financeTouched: false }), false)).toBe(false)
    expect(
      canAdjustScheduleAmount(schedule({ sourceType: PaymentScheduleSourceType.MANUAL }), false),
    ).toBe(false)
    expect(
      canAdjustScheduleAmount(schedule({ departureStatus: DepartureStatus.CLOSED }), false),
    ).toBe(false)
    expect(canAdjustScheduleAmount(schedule(), true)).toBe(false)
    expect(
      canAdjustScheduleAmount(
        schedule({
          sourceType: PaymentScheduleSourceType.DEPARTURE_RESOURCE,
          sourceId: 'departure-resource-1',
        }),
        false,
      ),
    ).toBe(true)
  })

  it('shows adjust for open finance-touched source-order receivable paths (#93)', () => {
    expect(
      canAdjustScheduleAmount(
        schedule({
          direction: PaymentScheduleDirection.RECEIVABLE,
          sourceType: PaymentScheduleSourceType.SOURCE_ORDER_GUEST_BALANCE_COLLECTION,
          scheduleNo: 'AR2026070001',
        }),
        false,
      ),
    ).toBe(true)
    expect(
      canAdjustScheduleAmount(
        schedule({
          direction: PaymentScheduleDirection.RECEIVABLE,
          sourceType: PaymentScheduleSourceType.SOURCE_ORDER_CUSTOMER_SETTLEMENT,
          scheduleNo: 'AR2026070002',
        }),
        false,
      ),
    ).toBe(true)
    expect(
      canAdjustScheduleAmount(
        schedule({
          direction: PaymentScheduleDirection.RECEIVABLE,
          sourceType: PaymentScheduleSourceType.MANUAL,
        }),
        false,
      ),
    ).toBe(false)
    expect(
      canAdjustScheduleAmount(
        schedule({
          direction: PaymentScheduleDirection.RECEIVABLE,
          sourceType: PaymentScheduleSourceType.SOURCE_ORDER_GUEST_BALANCE_COLLECTION,
          settledAmountCents: 100,
        }),
        false,
      ),
    ).toBe(false)
  })
})
