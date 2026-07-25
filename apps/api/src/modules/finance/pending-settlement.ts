import type { Prisma } from '@prisma/client'
import {
  deriveTransactionWriteoffStatus,
  TransactionWriteoffStatus,
} from '@xiaotuanbao/shared'

/** 工作台待核销流水 / 流水列表共用：正常且未核销或部分核销。 */
export const PENDING_SETTLEMENT_FLAG = '1' as const

/**
 * 待核销流水基础口径：非作废。
 * 剩余未核销金额 > 0（未核销 / 部分核销）由调用方结合已分配金额过滤。
 */
export function buildPendingSettlementBaseWhere(
  organizationId: string,
): Prisma.FinanceTransactionWhereInput {
  return {
    organizationId,
    voidedAt: null,
  }
}

export function isPendingSettlementWriteoff(
  amountCents: number,
  allocatedAmountCents: number,
): boolean {
  const { status } = deriveTransactionWriteoffStatus(amountCents, allocatedAmountCents)
  return (
    status === TransactionWriteoffStatus.NONE
    || status === TransactionWriteoffStatus.PARTIAL
  )
}

export function pendingSettlementHref(): string {
  return `/finance/transactions?status=normal&pendingSettlement=${PENDING_SETTLEMENT_FLAG}`
}

export function pendingSettlementTransactionHref(transactionNo: string): string {
  return `/finance/transactions?status=normal&transactionNo=${encodeURIComponent(transactionNo)}`
}

export function accountGenerationGapsHref(
  kind: 'any' | 'payable' | 'receivable' = 'any',
): string {
  return `/departure?accountGenerationGap=${kind}`
}
