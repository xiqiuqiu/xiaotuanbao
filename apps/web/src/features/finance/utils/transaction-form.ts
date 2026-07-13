import {
  CounterpartyType,
  PaymentChannel,
  TransactionDirection,
  type FinanceTransactionSummary,
} from '@xiaotuanbao/shared'
import { centsToYuan, dateStringToDayjs, dayjsToDateString, yuanToCents } from './finance-form'

export interface TransactionFormValues {
  direction: TransactionDirection
  paymentChannel: PaymentChannel
  amountYuan?: number
  transactionDate?: Parameters<typeof dayjsToDateString>[0]
  counterpartyType: CounterpartyType
  counterpartyId?: string
  counterpartyName?: string
  departureId?: string
  notes?: string
}

function resolveCounterpartyPayload(values: TransactionFormValues) {
  if (
    values.counterpartyType === CounterpartyType.PARTNER ||
    values.counterpartyType === CounterpartyType.SUPPLIER
  ) {
    return {
      counterpartyId: values.counterpartyId,
      counterpartyName: undefined,
    }
  }

  return {
    counterpartyId: values.counterpartyId,
    counterpartyName: values.counterpartyName?.trim() || undefined,
  }
}

export function buildCreateTransactionPayload(values: TransactionFormValues) {
  if (!values.departureId) {
    throw new Error('请选择关联发团')
  }

  return {
    direction: values.direction,
    paymentChannel: values.paymentChannel,
    amountCents: yuanToCents(values.amountYuan ?? 0),
    transactionDate: dayjsToDateString(values.transactionDate),
    counterpartyType: values.counterpartyType,
    ...resolveCounterpartyPayload(values),
    departureId: values.departureId,
    notes: values.notes?.trim() || undefined,
  }
}

export function buildUpdateTransactionPayload(values: TransactionFormValues) {
  return buildCreateTransactionPayload(values)
}

export function createEmptyTransactionFormValues(): TransactionFormValues {
  return {
    direction: TransactionDirection.INFLOW,
    paymentChannel: PaymentChannel.CASH,
    counterpartyType: CounterpartyType.PARTNER,
  }
}

export function transactionToFormValues(
  summary: FinanceTransactionSummary,
): TransactionFormValues {
  return {
    direction: summary.direction as TransactionDirection,
    paymentChannel: summary.paymentChannel as PaymentChannel,
    amountYuan: centsToYuan(summary.amountCents),
    transactionDate: dateStringToDayjs(summary.transactionDate),
    counterpartyType: summary.counterpartyType as CounterpartyType,
    counterpartyId: summary.counterpartyId ?? undefined,
    counterpartyName: summary.counterpartyName ?? undefined,
    departureId: summary.departureId ?? undefined,
    notes: summary.notes ?? undefined,
  }
}
