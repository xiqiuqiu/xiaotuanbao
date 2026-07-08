import type { FinanceTransactionSummary, PaymentScheduleSummary } from '@xiaotuanbao/shared'
import { centsToYuan } from './finance-form'
import { computeDefaultLinkAmountCents } from './link-transaction-form'
import {
  buildCreateVerificationPayload,
  directionFromTransaction,
} from './verification-form'

export interface VerifyFromTransactionFormValues {
  paymentScheduleId: string
  amountYuan: number
}

export function emptyVerifyFormValues(): VerifyFromTransactionFormValues {
  return {
    paymentScheduleId: '',
    amountYuan: 0,
  }
}

export function scheduleToVerifyFormValues(
  schedule: PaymentScheduleSummary,
  transaction: FinanceTransactionSummary,
): VerifyFromTransactionFormValues {
  return {
    paymentScheduleId: schedule.id,
    amountYuan: centsToYuan(computeDefaultLinkAmountCents(transaction, schedule)),
  }
}

export function buildVerifyFromTransactionPayload(
  transaction: FinanceTransactionSummary,
  values: VerifyFromTransactionFormValues,
) {
  return buildCreateVerificationPayload({
    paymentScheduleId: values.paymentScheduleId,
    transactionId: transaction.id,
    amountYuan: values.amountYuan,
    direction: directionFromTransaction(transaction),
    verificationDate: new Date().toISOString().slice(0, 10),
  })
}
