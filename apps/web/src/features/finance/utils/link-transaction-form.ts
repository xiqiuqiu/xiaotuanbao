import type { FinanceTransactionSummary, PaymentScheduleSummary } from '@xiaotuanbao/shared'
import { centsToYuan, yuanToCents } from './finance-form'

export interface LinkTransactionFormValues {
  transactionId: string
  amountYuan: number
}

export function computeDefaultLinkAmountCents(
  transaction: FinanceTransactionSummary,
  schedule: PaymentScheduleSummary,
): number {
  return Math.min(transaction.unallocatedAmountCents, schedule.unsettledAmountCents)
}

export function scheduleToLinkTransactionValues(): LinkTransactionFormValues {
  return {
    transactionId: '',
    amountYuan: 0,
  }
}

export function transactionToLinkTransactionValues(
  transaction: FinanceTransactionSummary,
  schedule: PaymentScheduleSummary,
): LinkTransactionFormValues {
  return {
    transactionId: transaction.id,
    amountYuan: centsToYuan(computeDefaultLinkAmountCents(transaction, schedule)),
  }
}

export function buildLinkTransactionPayload(values: LinkTransactionFormValues) {
  return {
    transactionId: values.transactionId,
    amountCents: yuanToCents(values.amountYuan),
  }
}
