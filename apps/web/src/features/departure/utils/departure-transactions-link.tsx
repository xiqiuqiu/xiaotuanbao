import { Link } from '@tanstack/react-router'
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

export function DepartureTransactionsLink({
  departureId,
  direction,
  children,
}: {
  departureId: string
  direction?: TransactionDirection
  children: React.ReactNode
}) {
  return (
    <Link
      to="/finance/transactions"
      search={buildDepartureTransactionListSearch(departureId, direction)}
      style={{ marginLeft: 8 }}
    >
      {children}
    </Link>
  )
}
