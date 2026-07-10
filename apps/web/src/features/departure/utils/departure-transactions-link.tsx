import { Link } from '@tanstack/react-router'
import type { TransactionDirection } from '@xiaotuanbao/shared'
import { buildDepartureTransactionListSearch } from './departure-transactions-search'

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
