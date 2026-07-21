import { useSearch } from '@tanstack/react-router'
import { TransactionsWorkspace } from '../components/TransactionsWorkspace'

export function TransactionsPage() {
  const deepLinkSearch = useSearch({ strict: false }) as {
    departureId?: string
    direction?: string
    status?: string
    pendingSettlement?: string
    transactionNo?: string
  }

  return (
    <TransactionsWorkspace
      scope="global"
      deepLinkSearch={deepLinkSearch}
      pageHeader={{ title: '收支流水' }}
    />
  )
}
