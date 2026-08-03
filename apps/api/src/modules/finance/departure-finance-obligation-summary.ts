import { PaymentScheduleDirection } from '@prisma/client'

/**
 * Legacy flat-field + settlement-progress facts for Departure read model (ADR-0004 C4).
 * Amounts keep historical clamped open-unsettled semantics (`Math.max`); Chinese tags stay
 * in Departure — this surface only exposes Finance-owned booleans/amounts.
 */
export interface DepartureFinanceObligationSummary {
  verifiedReceivableCents: number
  openUnsettledReceivableCents: number
  verifiedPayableCents: number
  openUnsettledPayableCents: number
  unverifiedIncomeCents: number
  unverifiedExpenseCents: number
  hasReceivableSchedule: boolean
  /** Every receivable has settledCents >= amountCents (closed-with-remaining is not fully settled). */
  allReceivablesAmountSettled: boolean
  hasPayableSchedule: boolean
  allPayablesAmountSettled: boolean
  /**
   * True when there is at least one schedule and every schedule is cancelled or
   * settledCents >= amountCents.
   */
  isFinanciallySettled: boolean
}

export interface DepartureFinanceObligationScheduleInput {
  direction: PaymentScheduleDirection
  amountCents: number
  cancelledAt: Date | null
  settledCents: number
}

export interface DepartureFinanceObligationUnverifiedCash {
  unverifiedIncomeCents: number
  unverifiedExpenseCents: number
}

export const emptyDepartureFinanceObligationSummary =
  (): DepartureFinanceObligationSummary => ({
    verifiedReceivableCents: 0,
    openUnsettledReceivableCents: 0,
    verifiedPayableCents: 0,
    openUnsettledPayableCents: 0,
    unverifiedIncomeCents: 0,
    unverifiedExpenseCents: 0,
    hasReceivableSchedule: false,
    allReceivablesAmountSettled: true,
    hasPayableSchedule: false,
    allPayablesAmountSettled: true,
    isFinanciallySettled: false,
  })

export function buildDepartureFinanceObligationSummary(input: {
  schedules: DepartureFinanceObligationScheduleInput[]
  unverifiedCash?: DepartureFinanceObligationUnverifiedCash
}): DepartureFinanceObligationSummary {
  const summary = emptyDepartureFinanceObligationSummary()
  const unverified = input.unverifiedCash ?? {
    unverifiedIncomeCents: 0,
    unverifiedExpenseCents: 0,
  }
  summary.unverifiedIncomeCents = unverified.unverifiedIncomeCents
  summary.unverifiedExpenseCents = unverified.unverifiedExpenseCents

  if (input.schedules.length === 0) {
    return summary
  }

  let allClosed = true
  for (const schedule of input.schedules) {
    const settled = schedule.settledCents
    const openRemaining =
      schedule.cancelledAt != null ? 0 : Math.max(schedule.amountCents - settled, 0)
    const amountSettled = settled >= schedule.amountCents
    const closed = schedule.cancelledAt != null || amountSettled
    if (!closed) {
      allClosed = false
    }

    if (schedule.direction === PaymentScheduleDirection.receivable) {
      summary.hasReceivableSchedule = true
      summary.verifiedReceivableCents += settled
      summary.openUnsettledReceivableCents += openRemaining
      if (!amountSettled) {
        summary.allReceivablesAmountSettled = false
      }
    } else {
      summary.hasPayableSchedule = true
      summary.verifiedPayableCents += settled
      summary.openUnsettledPayableCents += openRemaining
      if (!amountSettled) {
        summary.allPayablesAmountSettled = false
      }
    }
  }

  summary.isFinanciallySettled = allClosed
  return summary
}
