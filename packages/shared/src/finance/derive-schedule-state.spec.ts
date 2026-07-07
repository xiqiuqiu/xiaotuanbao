import { PaymentScheduleStatus } from '../enums/payment-schedule-status.enum'
import { deriveScheduleState } from './derive-schedule-state'

describe('deriveScheduleState', () => {
  const base = {
    amountCents: 10000,
    settledAmountCents: 0,
    dueDate: '2026-08-15',
    cancelledAt: null,
    businessDate: '2026-08-01',
  }

  it('returns cancelled when cancelledAt is set', () => {
    expect(
      deriveScheduleState({
        ...base,
        cancelledAt: '2026-08-10T00:00:00.000Z',
        settledAmountCents: 10000,
      }),
    ).toBe(PaymentScheduleStatus.CANCELLED)
  })

  it('returns settled when settledAmountCents >= amountCents', () => {
    expect(
      deriveScheduleState({
        ...base,
        settledAmountCents: 10000,
      }),
    ).toBe(PaymentScheduleStatus.SETTLED)

    expect(
      deriveScheduleState({
        ...base,
        settledAmountCents: 15000,
      }),
    ).toBe(PaymentScheduleStatus.SETTLED)
  })

  it('returns overdue when dueDate is before businessDate and not settled', () => {
    expect(
      deriveScheduleState({
        ...base,
        dueDate: '2026-07-31',
        businessDate: '2026-08-01',
      }),
    ).toBe(PaymentScheduleStatus.OVERDUE)
  })

  it('returns pending when dueDate is on or after businessDate', () => {
    expect(deriveScheduleState(base)).toBe(PaymentScheduleStatus.PENDING)

    expect(
      deriveScheduleState({
        ...base,
        dueDate: '2026-08-01',
        businessDate: '2026-08-01',
      }),
    ).toBe(PaymentScheduleStatus.PENDING)
  })

  it('prioritises cancelled over settled', () => {
    expect(
      deriveScheduleState({
        ...base,
        cancelledAt: '2026-08-10T00:00:00.000Z',
        settledAmountCents: 10000,
      }),
    ).toBe(PaymentScheduleStatus.CANCELLED)
  })

  it('prioritises settled over overdue', () => {
    expect(
      deriveScheduleState({
        ...base,
        dueDate: '2026-07-01',
        businessDate: '2026-08-01',
        settledAmountCents: 10000,
      }),
    ).toBe(PaymentScheduleStatus.SETTLED)
  })
})
