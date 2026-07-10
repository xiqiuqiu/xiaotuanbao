import { describe, expect, it } from 'vitest'
import { PaymentScheduleStatus, type PaymentScheduleSummary } from '@xiaotuanbao/shared'
import { canReopenSchedule } from './payment-schedule-table-columns'

function schedule(overrides: Partial<PaymentScheduleSummary> = {}): PaymentScheduleSummary {
  return {
    id: 'sch-1',
    departureId: 'dep-1',
    departureStatus: 'pending_settlement',
    direction: 'receivable',
    scheduleNo: 'AR2026070001',
    title: '团款',
    amountCents: 100000,
    dueDate: '2026-08-01',
    counterpartyType: 'guest',
    counterpartyId: null,
    counterpartyName: '客人',
    sourceType: 'manual',
    sourceId: null,
    status: PaymentScheduleStatus.CANCELLED,
    financeTouched: true,
    settledAmountCents: 0,
    unsettledAmountCents: 100000,
    cancelledAt: '2026-07-01T00:00:00.000Z',
    cancelledBy: 'user-1',
    closeDisposition: 'other',
    cancelReason: '关闭',
    amountAdjustedAt: null,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('canReopenSchedule', () => {
  it('shows reopen only for closed actionable schedules', () => {
    expect(canReopenSchedule(schedule(), false)).toBe(true)
    expect(canReopenSchedule(schedule({ status: PaymentScheduleStatus.PENDING }), false)).toBe(
      false,
    )
    expect(canReopenSchedule(schedule({ status: PaymentScheduleStatus.SETTLED }), false)).toBe(
      false,
    )
    expect(canReopenSchedule(schedule(), true)).toBe(false)
  })
})
