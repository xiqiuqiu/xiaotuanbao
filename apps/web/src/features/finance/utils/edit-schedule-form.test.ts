import { describe, expect, it } from 'vitest'
import {
  CounterpartyType,
  PaymentScheduleSourceType,
  type PaymentScheduleSummary,
} from '@xiaotuanbao/shared'
import { buildUpdateSchedulePayload, scheduleToEditValues } from './edit-schedule-form'

function schedule(overrides: Partial<PaymentScheduleSummary> = {}): PaymentScheduleSummary {
  return {
    id: 'sch-1',
    departureId: 'dep-1',
    departureStatus: 'editing',
    direction: 'receivable',
    scheduleNo: 'AR-1',
    title: '游客代收',
    amountCents: 10000,
    dueDate: '2026-08-10',
    counterpartyType: CounterpartyType.GUEST,
    counterpartyId: 'so-1',
    counterpartyName: '某客源单展示名',
    sourceType: PaymentScheduleSourceType.SOURCE_ORDER_GUEST_COLLECTION,
    sourceId: 'so-1',
    status: 'pending',
    financeTouched: false,
    settledAmountCents: 0,
    unsettledAmountCents: 10000,
    cancelledAt: null,
    cancelledBy: null,
    closeDisposition: null,
    cancelReason: null,
    voidedAt: null,
    voidedBy: null,
    voidedByName: null,
    voidReason: null,
    voidedAmountCents: null,
    amountAdjustedAt: null,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('edit schedule form payload', () => {
  it('keeps original title and does not rewrite guest counterparty name', () => {
    const current = schedule()
    const values = scheduleToEditValues(current)
    const payload = buildUpdateSchedulePayload(current, {
      ...values,
      amountYuan: 200,
    })

    expect(payload.title).toBe('游客代收')
    expect(payload.amountCents).toBe(20000)
    expect(payload.counterpartyName).toBeUndefined()
  })
})
