import { Injectable } from '@nestjs/common'
import { DepartureStatus, TransactionDirection } from '@prisma/client'
import type {
  AccountGenerationGapItem,
  WorkbenchFinanceAccountGenerationItem,
  WorkbenchFinancePendingSettlementItem,
  WorkbenchModule,
} from '@xiaotuanbao/shared'
import { PrismaService } from '../../database/prisma/prisma.service'
import { AccountGenerationGapService } from '../departure/account-generation-gap.service'
import { formatDateOnly } from '../departure/departure-date.utils'
import { VerificationService } from '../finance/verification.service'
import {
  buildOpenPayableBaseWhere,
  payableOpenUnpaidHref,
} from '../finance/payable-open-balance'
import {
  accountGenerationGapsHref,
  buildPendingSettlementBaseWhere,
  pendingSettlementHref,
  pendingSettlementTransactionHref,
} from '../finance/pending-settlement'

const QUEUE_LIMIT = 5

type PendingSettlementRow = {
  id: string
  transactionNo: string
  direction: 'inflow' | 'outflow'
  transactionDate: string
  unallocatedAmountCents: number
  counterpartyName: string | null
  departureClosed: boolean
}

function compareSettlement(left: PendingSettlementRow, right: PendingSettlementRow): number {
  if (left.unallocatedAmountCents !== right.unallocatedAmountCents) {
    return right.unallocatedAmountCents - left.unallocatedAmountCents
  }
  return left.transactionNo.localeCompare(right.transactionNo)
}

function toSettlementItem(row: PendingSettlementRow): WorkbenchFinancePendingSettlementItem {
  return {
    kind: 'finance-pending-settlement',
    id: row.id,
    title: row.counterpartyName?.trim() || row.transactionNo,
    description: row.transactionNo,
    href: pendingSettlementTransactionHref(row.transactionNo),
    direction: row.direction,
    transactionDate: row.transactionDate,
    unallocatedAmountCents: row.unallocatedAmountCents,
    counterpartyName: row.counterpartyName,
    departureClosed: row.departureClosed,
  }
}

function toGenerationItem(row: AccountGenerationGapItem): WorkbenchFinanceAccountGenerationItem {
  return {
    kind: 'finance-account-generation',
    id: row.id,
    title: row.title,
    description: row.departureName,
    href: row.href,
    generationKind: row.generationKind,
    estimatedAmountCents: row.estimatedAmountCents,
    departureClosed: row.departureClosed,
  }
}

@Injectable()
export class FinanceFundsWorkbenchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly verificationService: VerificationService,
    private readonly accountGenerationGapService: AccountGenerationGapService,
  ) {}

  async buildModule(organizationId: string): Promise<WorkbenchModule> {
    const [payableCandidates, transactionCandidates, generationItems] = await Promise.all([
      this.prisma.paymentSchedule.findMany({
        where: buildOpenPayableBaseWhere(organizationId),
        select: {
          id: true,
          amountCents: true,
        },
      }),
      this.prisma.financeTransaction.findMany({
        where: buildPendingSettlementBaseWhere(organizationId),
        select: {
          id: true,
          transactionNo: true,
          direction: true,
          transactionDate: true,
          amountCents: true,
          counterpartyName: true,
          departure: { select: { status: true } },
        },
      }),
      this.accountGenerationGapService.findPendingItems(organizationId),
    ])

    const settledMap = await this.verificationService.batchGetSettledAmounts(
      payableCandidates.map((row) => row.id),
    )
    const unpaidRows = payableCandidates
      .map((row) => ({
        id: row.id,
        unpaidAmountCents: Math.max(row.amountCents - (settledMap.get(row.id) ?? 0), 0),
      }))
      .filter((row) => row.unpaidAmountCents > 0)
    const pendingPaymentAmount = unpaidRows.reduce(
      (sum, row) => sum + row.unpaidAmountCents,
      0,
    )

    const allocatedMap = await this.verificationService.batchGetAllocatedAmounts(
      transactionCandidates.map((row) => row.id),
    )
    const pendingSettlementRows: PendingSettlementRow[] = transactionCandidates
      .map((row) => {
        const allocated = allocatedMap.get(row.id) ?? 0
        const unallocatedAmountCents = Math.max(row.amountCents - allocated, 0)
        return {
          id: row.id,
          transactionNo: row.transactionNo,
          direction:
            row.direction === TransactionDirection.inflow
              ? ('inflow' as const)
              : ('outflow' as const),
          transactionDate: formatDateOnly(row.transactionDate),
          unallocatedAmountCents,
          counterpartyName: row.counterpartyName,
          departureClosed: row.departure?.status === DepartureStatus.closed,
        }
      })
      .filter((row) => row.unallocatedAmountCents > 0)
    const incomeRows = pendingSettlementRows.filter((row) => row.direction === 'inflow')
    const expenseRows = pendingSettlementRows.filter((row) => row.direction === 'outflow')
    const pendingSettlementAmount = pendingSettlementRows.reduce(
      (sum, row) => sum + row.unallocatedAmountCents,
      0,
    )

    const settlementQueue = [...pendingSettlementRows]
      .sort(compareSettlement)
      .slice(0, QUEUE_LIMIT)
      .map(toSettlementItem)
    const generationQueue = generationItems.slice(0, QUEUE_LIMIT).map(toGenerationItem)

    return {
      key: 'finance-funds',
      title: '资金与账款',
      total: pendingSettlementRows.length,
      href: pendingSettlementHref(),
      secondaryTotal: generationItems.length,
      secondaryHref: accountGenerationGapsHref(),
      metrics: [
        {
          key: 'pending-payment',
          label: '待付款',
          value: pendingPaymentAmount,
          secondaryValue: unpaidRows.length,
          secondarySuffix: '个节点',
          href: payableOpenUnpaidHref(),
        },
        {
          key: 'pending-settlement',
          label: '待核销流水',
          value: pendingSettlementAmount,
          secondaryValue: pendingSettlementRows.length,
          secondarySuffix: `笔（收入 ${incomeRows.length} · 支出 ${expenseRows.length}）`,
          href: pendingSettlementHref(),
        },
      ],
      items: [...settlementQueue, ...generationQueue],
    }
  }
}
