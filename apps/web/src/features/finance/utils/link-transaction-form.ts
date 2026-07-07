import type { PaymentScheduleSummary } from '@xiaotuanbao/shared'
import { centsToYuan, yuanToCents } from './finance-form'

export interface LinkTransactionFormValues {
  transactionId: string
  amountYuan: number
}

export function scheduleToLinkTransactionValues(
  schedule: PaymentScheduleSummary,
): LinkTransactionFormValues {
  return {
    transactionId: '',
    amountYuan: centsToYuan(schedule.unsettledAmountCents),
  }
}

export function buildLinkTransactionPayload(values: LinkTransactionFormValues) {
  return {
    transactionId: values.transactionId,
    amountCents: yuanToCents(values.amountYuan),
  }
}
