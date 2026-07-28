import { describe, expect, it } from 'vitest'
import {
  PaymentScheduleSourceType,
  type PaymentScheduleSummary,
} from '@xiaotuanbao/shared'
import { canCloseSchedule } from './payment-schedule-table-columns'

function schedule(overrides: Partial<PaymentScheduleSummary> = {}): PaymentScheduleSummary {
  return {
    id: 'schedule-1',
    departureId: 'departure-1',
    departureStatus: 'editing',
    direction: 'payable',
    scheduleNo: 'APXTB202607000001',
    title: '资源应付',
    amountCents: 100000,
    dueDate: '2026-07-20',
    counterpartyType: 'supplier',
    counterpartyId: 'supplier-1',
    counterpartyName: '测试供应商',
    sourceType: 'segment_resource',
    sourceId: 'resource-1',
    status: 'pending',
    financeTouched: false,
    settledAmountCents: 0,
    unsettledAmountCents: 100000,
    cancelledAt: null,
    cancelledBy: null,
    closeDisposition: null,
    cancelReason: null,
    voidedAt: null,
    voidedBy: null,
    voidReason: null,
    voidedAmountCents: null,
    amountAdjustedAt: null,
    createdAt: '2026-07-15T00:00:00.000Z',
    updatedAt: '2026-07-15T00:00:00.000Z',
    ...overrides,
  }
}

describe('resource payable close action', () => {
  it('hides close before finance is touched', () => {
    expect(canCloseSchedule(schedule())).toBe(false)
  })

  it('shows close after finance is touched while unsettled', () => {
    expect(canCloseSchedule(schedule({ financeTouched: true }))).toBe(true)
  })

  it('keeps manual payables eligible without the resource-void rule', () => {
    expect(canCloseSchedule(schedule({ sourceType: 'manual', sourceId: null }))).toBe(true)
  })

  it('applies the same resource-void rule to departure_resource payables', () => {
    expect(
      canCloseSchedule(
        schedule({
          sourceType: PaymentScheduleSourceType.DEPARTURE_RESOURCE,
          sourceId: 'departure-resource-1',
        }),
      ),
    ).toBe(false)
    expect(
      canCloseSchedule(
        schedule({
          sourceType: PaymentScheduleSourceType.DEPARTURE_RESOURCE,
          sourceId: 'departure-resource-1',
          financeTouched: true,
        }),
      ),
    ).toBe(true)
  })
})
