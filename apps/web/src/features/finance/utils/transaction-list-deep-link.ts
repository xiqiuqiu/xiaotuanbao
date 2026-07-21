import { TransactionDirection } from '@xiaotuanbao/shared'
import type { TransactionDateRange } from './date-ranges'

export interface TransactionListDeepLinkSearch {
  departureId?: string
  direction?: string
  status?: string
  pendingSettlement?: string
  transactionNo?: string
}

export interface TransactionListDeepLinkState {
  dateRange: TransactionDateRange
  direction?: TransactionDirection
  writeoffStatus?: undefined
  pendingSettlement?: '1'
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
  status?: 'normal' | 'voided'
  pendingSettlement?: '1'
  transactionNo?: string
} {
  const departureId = trimOptional(search.departureId)
  const directionRaw = trimOptional(search.direction)
  const statusRaw = trimOptional(search.status)
  const pendingSettlement = trimOptional(search.pendingSettlement) === '1' ? '1' as const : undefined
  const transactionNo = trimOptional(search.transactionNo)

  const direction = Object.values(TransactionDirection).includes(
    directionRaw as TransactionDirection,
  )
    ? (directionRaw as TransactionDirection)
    : undefined
  const status = statusRaw === 'normal' || statusRaw === 'voided' ? statusRaw : undefined

  return {
    ...(departureId ? { departureId } : {}),
    ...(direction ? { direction } : {}),
    ...(status ? { status } : {}),
    ...(pendingSettlement ? { pendingSettlement } : {}),
    ...(transactionNo ? { transactionNo } : {}),
  }
}

/**
 * Deep link from departure summary or workbench:
 * - departureId lock (optional direction)
 * - pendingSettlement / transactionNo workbench filters
 */
export function applyTransactionListDeepLink(
  search: TransactionListDeepLinkSearch,
): TransactionListDeepLinkState | null {
  const resolved = resolveTransactionListDeepLinkSearch(search)
  const hasWorkbenchFilter = Boolean(
    resolved.pendingSettlement || resolved.transactionNo || resolved.status,
  )
  if (!resolved.departureId && !hasWorkbenchFilter) {
    return null
  }

  return {
    dateRange: null,
    direction: resolved.direction,
    writeoffStatus: undefined,
    pendingSettlement: resolved.pendingSettlement,
    departureFilter: resolved.departureId,
    partnerKeyword: '',
    transactionNo: resolved.transactionNo ?? '',
    statusFilter: resolved.status ?? (resolved.departureId || resolved.pendingSettlement
      ? 'normal'
      : undefined),
    page: 1,
    pageSize: 10,
  }
}
