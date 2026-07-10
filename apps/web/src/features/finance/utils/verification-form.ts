import type { FinanceTransactionSummary, PaymentScheduleSummary } from '@xiaotuanbao/shared'
import { TransactionDirection } from '@xiaotuanbao/shared'
import { centsToYuan, yuanToCents } from './finance-form'
import { matchesCounterparty } from './verification-candidates'

export type VerificationDirection = 'receivable' | 'payable'

export interface CreateVerificationFormValues {
  direction: VerificationDirection
  verificationDate: string
  departureId?: string
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

export function getInitialVerificationValues({
  lockedDepartureId,
  initialTransaction,
  initialSchedule,
}: {
  lockedDepartureId?: string
  initialTransaction?: FinanceTransactionSummary
  initialSchedule?: PaymentScheduleSummary
}): CreateVerificationFormValues {
  const initialValues = emptyCreateVerificationFormValues({
    ...(lockedDepartureId ? { departureId: lockedDepartureId } : {}),
  })

  if (initialTransaction) {
    initialValues.transactionId = initialTransaction.id
    initialValues.direction = directionFromTransaction(initialTransaction)
    if (initialTransaction.departureId && !lockedDepartureId) {
      initialValues.departureId = initialTransaction.departureId
    }
  }

  if (initialSchedule) {
    initialValues.paymentScheduleId = initialSchedule.id
    initialValues.direction =
      initialSchedule.direction === 'receivable' ? 'receivable' : 'payable'
    if (initialSchedule.departureId && !lockedDepartureId) {
      initialValues.departureId = initialSchedule.departureId
    }
  }

  if (
    initialTransaction &&
    initialSchedule &&
    matchesCounterparty(initialTransaction, initialSchedule)
  ) {
    return {
      ...initialValues,
      ...transactionAndScheduleToFormValues(initialTransaction, initialSchedule),
    }
  }

  return initialValues
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
