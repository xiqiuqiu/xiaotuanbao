import {
  PaymentScheduleStatus,
  TransactionDirection,
  type FinanceTransactionSummary,
  type PaymentScheduleSummary,
} from '@xiaotuanbao/shared'
import type { VerificationDirection } from './verification-form'

export function matchesCounterparty(
  transaction: FinanceTransactionSummary,
  schedule: PaymentScheduleSummary,
): boolean {
  if (transaction.counterpartyType !== schedule.counterpartyType) {
    return false
  }
  if (schedule.counterpartyId) {
    return transaction.counterpartyId === schedule.counterpartyId
  }
  return transaction.counterpartyName === schedule.counterpartyName
}

function expectedTransactionDirection(direction: VerificationDirection): string {
  return direction === 'receivable' ? TransactionDirection.INFLOW : TransactionDirection.OUTFLOW
}

function formatDepartureLabel(
  departureId: string | null | undefined,
  departureMap: Map<string, { departureNo: string; name: string }>,
): string {
  if (!departureId) {
    return '—'
  }
  const departure = departureMap.get(departureId)
  if (!departure) {
    return '—'
  }
  return `${departure.departureNo} · ${departure.name}`
}

export function filterCandidateTransactions(params: {
  transactions: FinanceTransactionSummary[]
  direction: VerificationDirection
  departureId?: string
  counterpartyKeyword?: string
  searchKeyword?: string
  departureMap: Map<string, { departureNo: string; name: string }>
}): FinanceTransactionSummary[] {
  const {
    transactions,
    direction,
    departureId,
    counterpartyKeyword,
    searchKeyword,
    departureMap,
  } = params

  const expectedDirection = expectedTransactionDirection(direction)
  const normalizedCounterpartyKeyword = counterpartyKeyword?.trim().toLowerCase() ?? ''
  const normalizedSearchKeyword = searchKeyword?.trim().toLowerCase() ?? ''

  return transactions.filter((transaction) => {
    if (
      transaction.voidedAt ||
      transaction.unallocatedAmountCents <= 0 ||
      transaction.direction !== expectedDirection
    ) {
      return false
    }

    if (departureId && transaction.departureId !== departureId) {
      return false
    }

    if (
      normalizedCounterpartyKeyword &&
      !(transaction.counterpartyName ?? '').toLowerCase().includes(normalizedCounterpartyKeyword)
    ) {
      return false
    }

    if (!normalizedSearchKeyword) {
      return true
    }

    const departureLabel = formatDepartureLabel(transaction.departureId, departureMap)
    const haystack =
      `${transaction.transactionNo} ${transaction.counterpartyName ?? ''} ${departureLabel}`.toLowerCase()
    return haystack.includes(normalizedSearchKeyword)
  })
}

export function filterCandidateSchedules(params: {
  schedules: PaymentScheduleSummary[]
  selectedTransaction: FinanceTransactionSummary
  departureId?: string
  searchKeyword?: string
  departureMap: Map<string, { departureNo: string; name: string }>
}): PaymentScheduleSummary[] {
  const { schedules, selectedTransaction, departureId, searchKeyword, departureMap } = params
  const scopeDepartureId = departureId ?? selectedTransaction.departureId ?? undefined
  const normalizedSearchKeyword = searchKeyword?.trim().toLowerCase() ?? ''

  return schedules.filter((schedule) => {
    if (
      schedule.status === PaymentScheduleStatus.CANCELLED ||
      schedule.unsettledAmountCents <= 0 ||
      !matchesCounterparty(selectedTransaction, schedule)
    ) {
      return false
    }

    if (scopeDepartureId && schedule.departureId !== scopeDepartureId) {
      return false
    }

    if (!normalizedSearchKeyword) {
      return true
    }

    const departureLabel = formatDepartureLabel(schedule.departureId, departureMap)
    const haystack =
      `${schedule.scheduleNo} ${schedule.title} ${schedule.counterpartyName ?? ''} ${departureLabel}`.toLowerCase()
    return haystack.includes(normalizedSearchKeyword)
  })
}
