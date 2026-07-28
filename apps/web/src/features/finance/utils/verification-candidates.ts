import {
  PaymentScheduleStatus,
  TransactionDirection,
  type FinanceTransactionSummary,
  type PaymentScheduleSummary,
} from '@xiaotuanbao/shared'
import { counterpartyCollectionMethodText } from './counterparty-display'
import type { VerificationDirection } from './verification-form'

export function matchesCounterparty(
  transaction: FinanceTransactionSummary,
  schedule: PaymentScheduleSummary,
): boolean {
  if (transaction.counterpartyType !== schedule.counterpartyType) {
    return false
  }
  const scheduleId = schedule.counterpartyId?.trim() || null
  const transactionId = transaction.counterpartyId?.trim() || null
  if (scheduleId || transactionId) {
    return scheduleId === transactionId
  }
  return transaction.counterpartyName === schedule.counterpartyName
}

function expectedTransactionDirection(direction: VerificationDirection): string {
  return direction === 'receivable' ? TransactionDirection.INFLOW : TransactionDirection.OUTFLOW
}

/** 候选搜索用文案：收款方式与往来对象分词，不再用「·」拼接展示串。 */
export function formatCounterpartySearchText(
  counterpartyType: string,
  counterpartyName: string | null | undefined,
): string {
  const method = counterpartyCollectionMethodText(counterpartyType)
  const name = counterpartyName?.trim()
  if (!name) {
    return method
  }
  // 名称非空时不回落「-」，避免无效搜索词。
  return `${method} ${name}`
}

function formatDepartureLabel(
  departureId: string | null | undefined,
  departureMap: Map<string, { departureNo: string; name: string }>,
): string {
  if (!departureId) {
    return '-'
  }
  const departure = departureMap.get(departureId)
  if (!departure) {
    return '-'
  }
  return `${departure.departureNo} · ${departure.name}`
}

export function filterCandidateTransactions(params: {
  transactions: FinanceTransactionSummary[]
  direction: VerificationDirection
  selectedSchedule?: PaymentScheduleSummary
  departureId?: string
  searchKeyword?: string
  departureMap: Map<string, { departureNo: string; name: string }>
}): FinanceTransactionSummary[] {
  const {
    transactions,
    direction,
    selectedSchedule,
    departureId,
    searchKeyword,
    departureMap,
  } = params

  const expectedDirection = expectedTransactionDirection(direction)
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

    if (selectedSchedule && !matchesCounterparty(transaction, selectedSchedule)) {
      return false
    }

    if (!normalizedSearchKeyword) {
      return true
    }

    const departureLabel = formatDepartureLabel(transaction.departureId, departureMap)
    const counterpartyLabel = formatCounterpartySearchText(
      transaction.counterpartyType,
      transaction.counterpartyName,
    )
    const haystack =
      `${transaction.transactionNo} ${counterpartyLabel} ${departureLabel}`.toLowerCase()
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
  const scopeDepartureId = departureId
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
    const counterpartyLabel = formatCounterpartySearchText(
      schedule.counterpartyType,
      schedule.counterpartyName,
    )
    const haystack =
      `${schedule.scheduleNo} ${schedule.title} ${counterpartyLabel} ${departureLabel}`.toLowerCase()
    return haystack.includes(normalizedSearchKeyword)
  })
}
