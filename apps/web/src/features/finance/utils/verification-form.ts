import type { FinanceTransactionSummary, PaymentScheduleSummary } from '@xiaotuanbao/shared'
import { TransactionDirection } from '@xiaotuanbao/shared'
import { centsToYuan, yuanToCents } from './finance-form'

export type VerificationDirection = 'receivable' | 'payable'

export interface CreateVerificationFormValues {
  direction: VerificationDirection
  verificationDate: string
  departureId?: string
  counterpartyKeyword?: string
  transactionId: string
  paymentScheduleId: string
  amountYuan: number
  remark?: string
}

/** @deprecated Use CreateVerificationFormValues */
export type VerificationFormValues = CreateVerificationFormValues

export function emptyCreateVerificationFormValues(
  overrides: Partial<CreateVerificationFormValues> = {},
): CreateVerificationFormValues {
  return {
    direction: 'receivable',
    verificationDate: new Date().toISOString().slice(0, 10),
    departureId: undefined,
    counterpartyKeyword: undefined,
    transactionId: '',
    paymentScheduleId: '',
    amountYuan: 0,
    remark: undefined,
    ...overrides,
  }
}

export function computeDefaultVerificationAmountCents(
  transaction: FinanceTransactionSummary,
  schedule: PaymentScheduleSummary,
): number {
  return Math.min(transaction.unallocatedAmountCents, schedule.unsettledAmountCents)
}

export function transactionAndScheduleToFormValues(
  transaction: FinanceTransactionSummary,
  schedule: PaymentScheduleSummary,
): Pick<CreateVerificationFormValues, 'transactionId' | 'paymentScheduleId' | 'amountYuan'> {
  return {
    transactionId: transaction.id,
    paymentScheduleId: schedule.id,
    amountYuan: centsToYuan(computeDefaultVerificationAmountCents(transaction, schedule)),
  }
}

export function directionFromTransaction(
  transaction: FinanceTransactionSummary,
): VerificationDirection {
  return transaction.direction === TransactionDirection.INFLOW ? 'receivable' : 'payable'
}

export function buildCreateVerificationPayload(values: CreateVerificationFormValues) {
  return {
    paymentScheduleId: values.paymentScheduleId,
    transactionId: values.transactionId,
    amountCents: yuanToCents(values.amountYuan),
    verificationDate: values.verificationDate,
    remark: values.remark?.trim() || undefined,
  }
}
