import { PaymentChannel, type PaymentScheduleSummary } from '@xiaotuanbao/shared'
import { centsToYuan, dateStringToDayjs, dayjsToDateString, yuanToCents } from './finance-form'
import type { Dayjs } from 'dayjs'

export interface RegisterSettlementFormValues {
  amountYuan: number
  paymentChannel: PaymentChannel
  transactionDate: Dayjs | null
  notes?: string
}

export function scheduleToRegisterSettlementValues(
  schedule: PaymentScheduleSummary,
): RegisterSettlementFormValues {
  return {
    amountYuan: centsToYuan(schedule.unsettledAmountCents),
    paymentChannel: PaymentChannel.CASH,
    transactionDate: dateStringToDayjs(new Date().toISOString().slice(0, 10)),
    notes: undefined,
  }
}

export function buildRegisterSettlementPayload(values: RegisterSettlementFormValues) {
  return {
    amountCents: yuanToCents(values.amountYuan),
    paymentChannel: values.paymentChannel,
    transactionDate: dayjsToDateString(values.transactionDate),
    notes: values.notes?.trim() || undefined,
  }
}
