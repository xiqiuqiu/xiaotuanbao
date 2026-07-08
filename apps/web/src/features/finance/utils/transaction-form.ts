import { CounterpartyType, PaymentChannel, TransactionDirection } from '@xiaotuanbao/shared'
import { dayjsToDateString, yuanToCents } from './finance-form'

export interface TransactionFormValues {
  direction: TransactionDirection
  paymentChannel: PaymentChannel
  amountYuan: number
  transactionDate: Parameters<typeof dayjsToDateString>[0]
  counterpartyType: CounterpartyType
  counterpartyName?: string
  departureId?: string
  notes?: string
}

export function buildCreateTransactionPayload(values: TransactionFormValues) {
  return {
    direction: values.direction,
    paymentChannel: values.paymentChannel,
    amountCents: yuanToCents(values.amountYuan),
    transactionDate: dayjsToDateString(values.transactionDate),
    counterpartyType: values.counterpartyType,
    counterpartyName: values.counterpartyName?.trim() || undefined,
    departureId: values.departureId,
    notes: values.notes?.trim() || undefined,
  }
}
