import { TransactionDirection } from '@xiaotuanbao/shared'
import type { TransactionDateRange } from './date-ranges'

export interface TransactionListDeepLinkSearch {
  departureId?: string
  direction?: string
}

export interface TransactionListDeepLinkState {
  dateRange: TransactionDateRange
  direction?: TransactionDirection
  writeoffStatus?: undefined
  departureFilter?: string
  partnerKeyword: string
  transactionNo: string
  statusFilter?: 'normal' | 'voided'
  page: number
  pageSize: number
}

function trimOptional(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  const trimmed = value.trim()
  return trimmed || undefined
}

export function resolveTransactionListDeepLinkSearch(
  search: TransactionListDeepLinkSearch,
): {
  departureId?: string
  direction?: TransactionDirection
} {
  const departureId = trimOptional(search.departureId)
  const directionRaw = trimOptional(search.direction)

  const direction = Object.values(TransactionDirection).includes(
    directionRaw as TransactionDirection,
  )
    ? (directionRaw as TransactionDirection)
    : undefined

  return {
    ...(departureId ? { departureId } : {}),
    ...(direction ? { direction } : {}),
  }
}

/** Deep link from departure summary: lock departure (+ optional direction), clear date range. */
export function applyTransactionListDeepLink(
  search: TransactionListDeepLinkSearch,
): TransactionListDeepLinkState | null {
  const resolved = resolveTransactionListDeepLinkSearch(search)
  if (!resolved.departureId) {
    return null
  }

  return {
    dateRange: null,
    direction: resolved.direction,
    writeoffStatus: undefined,
    departureFilter: resolved.departureId,
    partnerKeyword: '',
    transactionNo: '',
    statusFilter: 'normal',
    page: 1,
    pageSize: 10,
  }
}
