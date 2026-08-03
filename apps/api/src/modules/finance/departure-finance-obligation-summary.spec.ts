import { PaymentScheduleDirection } from '@prisma/client'
import {
  buildDepartureFinanceObligationSummary,
  emptyDepartureFinanceObligationSummary,
} from './departure-finance-obligation-summary'

describe('buildDepartureFinanceObligationSummary', () => {
  const receivable = {
    direction: PaymentScheduleDirection.receivable,
    amountCents: 1_000_000,
    cancelledAt: null as Date | null,
    settledCents: 600_000,
  }
  const payable = {
    direction: PaymentScheduleDirection.payable,
    amountCents: 500_000,
    cancelledAt: null as Date | null,
    settledCents: 200_000,
  }

  it('returns empty defaults when there are no schedules', () => {
    expect(buildDepartureFinanceObligationSummary({ schedules: [] })).toEqual(
      emptyDepartureFinanceObligationSummary(),
    )
  })

  it('computes clamped verified and open-unsettled amounts (legacy flat semantics)', () => {
    const summary = buildDepartureFinanceObligationSummary({
      schedules: [receivable, payable],
    })

    expect(summary.verifiedReceivableCents).toBe(600_000)
    expect(summary.openUnsettledReceivableCents).toBe(400_000)
    expect(summary.verifiedPayableCents).toBe(200_000)
    expect(summary.openUnsettledPayableCents).toBe(300_000)
    expect(summary.hasReceivableSchedule).toBe(true)
    expect(summary.hasPayableSchedule).toBe(true)
    expect(summary.allReceivablesAmountSettled).toBe(false)
    expect(summary.allPayablesAmountSettled).toBe(false)
    expect(summary.isFinanciallySettled).toBe(false)
  })

  it('keeps closed-node remaining out of open unsettled but inside the settlement gate', () => {
    const cancelledAt = new Date('2026-07-01')
    const summary = buildDepartureFinanceObligationSummary({
      schedules: [
        {
          direction: PaymentScheduleDirection.payable,
          amountCents: 1_000_000,
          cancelledAt,
          settledCents: 400_000,
        },
      ],
    })

    expect(summary.verifiedPayableCents).toBe(400_000)
    expect(summary.openUnsettledPayableCents).toBe(0)
    expect(summary.hasPayableSchedule).toBe(true)
    // Tag semantics: closed-with-remaining is not "已付清".
    expect(summary.allPayablesAmountSettled).toBe(false)
    expect(summary.isFinanciallySettled).toBe(true)
  })

  it('marks amount-settled flags when every open direction is fully settled', () => {
    const summary = buildDepartureFinanceObligationSummary({
      schedules: [
        { ...receivable, settledCents: 1_000_000 },
        { ...payable, settledCents: 500_000 },
      ],
    })

    expect(summary.allReceivablesAmountSettled).toBe(true)
    expect(summary.allPayablesAmountSettled).toBe(true)
    expect(summary.isFinanciallySettled).toBe(true)
  })

  it('passes through clamped unverified cash for flat-field aliasing', () => {
    const summary = buildDepartureFinanceObligationSummary({
      schedules: [],
      unverifiedCash: {
        unverifiedIncomeCents: 400_000,
        unverifiedExpenseCents: 400_000,
      },
    })

    expect(summary.unverifiedIncomeCents).toBe(400_000)
    expect(summary.unverifiedExpenseCents).toBe(400_000)
    expect(summary.isFinanciallySettled).toBe(false)
  })

  it('treats settledCents as VerificationService semantics (caller may include voided-txn normals)', () => {
    // Facade feeds settledCents = Σ normal verifications with no voidedAt filter.
    const summary = buildDepartureFinanceObligationSummary({
      schedules: [
        {
          direction: PaymentScheduleDirection.receivable,
          amountCents: 1_000_000,
          cancelledAt: null,
          settledCents: 1_000_000,
        },
      ],
    })

    expect(summary.verifiedReceivableCents).toBe(1_000_000)
    expect(summary.openUnsettledReceivableCents).toBe(0)
    expect(summary.allReceivablesAmountSettled).toBe(true)
    expect(summary.isFinanciallySettled).toBe(true)
  })
})
