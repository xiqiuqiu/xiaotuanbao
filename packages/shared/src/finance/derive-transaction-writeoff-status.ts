import { TransactionWriteoffStatus } from '../enums/transaction-writeoff-status.enum'

export interface TransactionWriteoffStatusResult {
  status: TransactionWriteoffStatus
  label: '未核销' | '部分核销' | '已核销'
}

export function deriveTransactionWriteoffStatus(
  amountCents: number,
  allocatedAmountCents: number,
): TransactionWriteoffStatusResult {
  if (allocatedAmountCents <= 0) {
    return { status: TransactionWriteoffStatus.NONE, label: '未核销' }
  }

  if (allocatedAmountCents >= amountCents) {
    return { status: TransactionWriteoffStatus.DONE, label: '已核销' }
  }

  return { status: TransactionWriteoffStatus.PARTIAL, label: '部分核销' }
}
