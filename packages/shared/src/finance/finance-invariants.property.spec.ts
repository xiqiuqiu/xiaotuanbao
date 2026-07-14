import { PaymentScheduleDirection } from '../enums/payment-schedule-direction.enum'
import { PaymentScheduleStatus } from '../enums/payment-schedule-status.enum'
import { TransactionWriteoffStatus } from '../enums/transaction-writeoff-status.enum'
import { deriveScheduleState } from './derive-schedule-state'
import { deriveTransactionWriteoffStatus } from './derive-transaction-writeoff-status'

function seededIntegers(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state
  }
}

describe('finance invariants (fixed-seed property)', () => {
  it('keeps schedule and transaction derived states consistent across amount boundaries', () => {
    const next = seededIntegers(0x5a17c0de)

    for (let index = 0; index < 2000; index += 1) {
      const amountCents = (next() % 10_000_000) + 1
      const allocatedAmountCents = next() % (amountCents + 1)
      const transactionState = deriveTransactionWriteoffStatus(
        amountCents,
        allocatedAmountCents,
      )
      const scheduleState = deriveScheduleState({
        amountCents,
        settledAmountCents: allocatedAmountCents,
        dueDate: '2026-07-10',
        businessDate: '2026-07-10',
        cancelledAt: null,
        direction: PaymentScheduleDirection.RECEIVABLE,
      })

      expect(amountCents - allocatedAmountCents).toBeGreaterThanOrEqual(0)
      if (allocatedAmountCents === 0) {
        expect(transactionState.status).toBe(TransactionWriteoffStatus.NONE)
        expect(scheduleState).toBe(PaymentScheduleStatus.PENDING)
      } else if (allocatedAmountCents === amountCents) {
        expect(transactionState.status).toBe(TransactionWriteoffStatus.DONE)
        expect(scheduleState).toBe(PaymentScheduleStatus.SETTLED)
      } else {
        expect(transactionState.status).toBe(TransactionWriteoffStatus.PARTIAL)
        expect(scheduleState).toBe(PaymentScheduleStatus.PENDING)
      }
    }
  })

  it('keeps close and business-date precedence deterministic', () => {
    const next = seededIntegers(0x71c10c0d)

    for (let index = 0; index < 2000; index += 1) {
      const amountCents = (next() % 1_000_000) + 1
      const partialCents = next() % amountCents

      expect(
        deriveScheduleState({
          amountCents,
          settledAmountCents: partialCents,
          dueDate: '2026-07-09',
          businessDate: '2026-07-10',
          cancelledAt: '2026-07-08T00:00:00.000Z',
          direction: PaymentScheduleDirection.RECEIVABLE,
        }),
      ).toBe(PaymentScheduleStatus.CANCELLED)

      expect(
        deriveScheduleState({
          amountCents,
          settledAmountCents: partialCents,
          dueDate: '2026-07-09',
          businessDate: '2026-07-10',
          cancelledAt: null,
          direction: PaymentScheduleDirection.RECEIVABLE,
        }),
      ).toBe(PaymentScheduleStatus.OVERDUE)

      expect(
        deriveScheduleState({
          amountCents,
          settledAmountCents: partialCents,
          dueDate: '2026-07-09',
          businessDate: '2026-07-10',
          cancelledAt: null,
          direction: PaymentScheduleDirection.PAYABLE,
        }),
      ).toBe(PaymentScheduleStatus.PENDING)

      expect(
        deriveScheduleState({
          amountCents,
          settledAmountCents: partialCents,
          dueDate: '2026-07-10',
          businessDate: '2026-07-10',
          cancelledAt: null,
          direction: PaymentScheduleDirection.RECEIVABLE,
        }),
      ).toBe(PaymentScheduleStatus.PENDING)
    }
  })
})
