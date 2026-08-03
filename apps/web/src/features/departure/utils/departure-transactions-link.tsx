import { Link } from '@tanstack/react-router'
import type { TransactionDirection } from '@xiaotuanbao/shared'
import { buildDepartureTransactionTabSearch } from './departure-transactions-search'

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
      to="/departure/$departureId"
      params={{ departureId }}
      search={buildDepartureTransactionTabSearch(direction)}
      style={{ marginInlineStart: 8 }}
    >
      {children}
    </Link>
  )
}
