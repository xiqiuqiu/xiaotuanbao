import { useSearch } from '@tanstack/react-router'
import { TransactionsWorkspace } from '../components/TransactionsWorkspace'

export function TransactionsPage() {
  const deepLinkSearch = useSearch({ strict: false }) as {
    departureId?: string
    direction?: string
  }

  return (
    <TransactionsWorkspace
      scope="global"
      deepLinkSearch={deepLinkSearch}
      pageHeader={{ title: '收支流水' }}
    />
  )
}
