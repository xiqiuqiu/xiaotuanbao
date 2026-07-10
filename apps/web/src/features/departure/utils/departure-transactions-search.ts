import type { TransactionDirection } from '@xiaotuanbao/shared'

/** Deep-link to the transaction list filtered by the current departure (and optional direction). */
export function buildDepartureTransactionListSearch(
  departureId: string,
  direction?: TransactionDirection,
): {
  departureId: string
  direction?: TransactionDirection
} {
  return {
    departureId,
    ...(direction ? { direction } : {}),
  }
}
