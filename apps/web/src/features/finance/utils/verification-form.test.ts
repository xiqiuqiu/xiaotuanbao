import {
  PaymentScheduleStatus,
  TransactionDirection,
  type FinanceTransactionSummary,
  type PaymentScheduleSummary,
} from '@xiaotuanbao/shared'
import { describe, expect, it } from 'vitest'
import { getInitialVerificationValues } from './verification-form'

function makeTransaction(
  overrides: Partial<FinanceTransactionSummary> = {},
): FinanceTransactionSummary {
  return {
    id: 'tx-1',
    transactionNo: 'TX202601000001',
    direction: TransactionDirection.INFLOW,
    paymentChannel: 'bank_transfer',
    amountCents: 100000,
    allocatedAmountCents: 0,
    unallocatedAmountCents: 100000,
    transactionDate: '2026-01-15',
    counterpartyType: 'partner',
    counterpartyId: 'cp-1',
    counterpartyName: '华东国旅',
    departureId: 'dep-1',
    departureNo: 'DT202601',
    departureName: '云南六日游',
    departureStatus: null,
    voidedAt: null,
    voidReason: null,
    notes: null,
    sourceAmountChanged: false,
    createdAt: '2026-01-15T00:00:00.000Z',
    updatedAt: '2026-01-15T00:00:00.000Z',
    ...overrides,
  }
}

function makeSchedule(overrides: Partial<PaymentScheduleSummary> = {}): PaymentScheduleSummary {
  return {
    id: 'sch-1',
    departureId: 'dep-1',
    departureStatus: 'editing',
    direction: 'receivable',
    scheduleNo: 'AR202601000001',
    title: '团款',
    amountCents: 100000,
    dueDate: '2026-01-20',
    counterpartyType: 'partner',
    counterpartyId: 'cp-1',
    counterpartyName: '华东国旅',
    sourceType: 'manual',
    sourceId: null,
    status: PaymentScheduleStatus.PENDING,
    financeTouched: false,
    settledAmountCents: 0,
    unsettledAmountCents: 100000,
    cancelledAt: null,
    cancelledBy: null,
    closeDisposition: null,
    cancelReason: null,
    amountAdjustedAt: null,
    createdAt: '2026-01-15T00:00:00.000Z',
    updatedAt: '2026-01-15T00:00:00.000Z',
    ...overrides,
  }
}

describe('getInitialVerificationValues', () => {
  it('defaults transaction and direction from the opened transaction', () => {
    const values = getInitialVerificationValues({
      initialTransaction: makeTransaction({ counterpartyName: '华东国旅' }),
    })

    expect(values.transactionId).toBe('tx-1')
    expect(values.direction).toBe('receivable')
    expect(values.departureId).toBeUndefined()
  })

  it('defaults schedule and direction from the opened payment schedule', () => {
    const values = getInitialVerificationValues({
      initialSchedule: makeSchedule({ counterpartyName: '华南旅业' }),
    })

    expect(values.paymentScheduleId).toBe('sch-1')
    expect(values.direction).toBe('receivable')
    expect(values.departureId).toBeUndefined()
  })

  it('prefills amount when opened with matching transaction and schedule', () => {
    const values = getInitialVerificationValues({
      initialTransaction: makeTransaction(),
      initialSchedule: makeSchedule(),
    })

    expect(values.transactionId).toBe('tx-1')
    expect(values.paymentScheduleId).toBe('sch-1')
    expect(values.amountYuan).toBe(1000)
  })

  it('leaves selection empty when opened without a source record', () => {
    const values = getInitialVerificationValues({})

    expect(values.transactionId).toBe('')
    expect(values.paymentScheduleId).toBe('')
    expect(values.amountYuan).toBe(0)
  })

  it('respects lockedDepartureId over source departure', () => {
    const values = getInitialVerificationValues({
      lockedDepartureId: 'dep-locked',
      initialTransaction: makeTransaction({ departureId: 'dep-1' }),
    })

    expect(values.departureId).toBe('dep-locked')
  })
})
