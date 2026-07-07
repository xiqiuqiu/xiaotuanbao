import type { PaymentScheduleSummary } from '@xiaotuanbao/shared'
import { centsToYuan, dateStringToDayjs, dayjsToDateString, yuanToCents } from './finance-form'

export interface ConfirmPaymentFormValues {
  amountYuan: number
  transactionDate: ReturnType<typeof dateStringToDayjs>
  notes?: string
}

export function scheduleToConfirmPaymentValues(
  schedule: PaymentScheduleSummary,
): ConfirmPaymentFormValues {
  return {
    amountYuan: centsToYuan(schedule.unsettledAmountCents),
    transactionDate: dateStringToDayjs(new Date().toISOString().slice(0, 10)),
    notes: undefined,
  }
}

export function buildConfirmPaymentPayload(values: ConfirmPaymentFormValues) {
  return {
    amountCents: yuanToCents(values.amountYuan),
    transactionDate: dayjsToDateString(values.transactionDate),
    notes: values.notes?.trim() || undefined,
  }
}
