import type { FinanceTransactionSummary, PaymentScheduleSummary } from '@xiaotuanbao/shared'
import { centsToYuan } from './finance-form'
import { computeDefaultLinkAmountCents } from './link-transaction-form'
import { buildCreateVerificationPayload } from './verification-form'

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
  transactionId: string,
  values: VerifyFromTransactionFormValues,
) {
  return buildCreateVerificationPayload({
    paymentScheduleId: values.paymentScheduleId,
    transactionId,
    amountYuan: values.amountYuan,
  })
}
