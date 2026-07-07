import type { PaymentScheduleSummary } from '@xiaotuanbao/shared'
import { centsToYuan, dateStringToDayjs, dayjsToDateString, yuanToCents } from './finance-form'

export interface ConfirmCollectionFormValues {
  amountYuan: number
  transactionDate: ReturnType<typeof dateStringToDayjs>
  notes?: string
}

export function scheduleToConfirmCollectionValues(
  schedule: PaymentScheduleSummary,
): ConfirmCollectionFormValues {
  return {
    amountYuan: centsToYuan(schedule.unsettledAmountCents),
    transactionDate: dateStringToDayjs(new Date().toISOString().slice(0, 10)),
    notes: undefined,
  }
}

export function buildConfirmCollectionPayload(values: ConfirmCollectionFormValues) {
  return {
    amountCents: yuanToCents(values.amountYuan),
    transactionDate: dayjsToDateString(values.transactionDate),
    notes: values.notes?.trim() || undefined,
  }
}
