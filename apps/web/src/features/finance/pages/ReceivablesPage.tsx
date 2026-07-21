import { useSearch } from '@tanstack/react-router'
import { PaymentScheduleWorkspace } from '../components/PaymentScheduleWorkspace'
import type { ReceivableListSearch } from '../utils/receivable-list-search'

export function ReceivablesPage() {
  const search = useSearch({ strict: false }) as ReceivableListSearch

  return (
    <PaymentScheduleWorkspace
      scope="global"
      direction="receivable"
      readOnly={false}
      pageHeader={{ title: '应收管理' }}
      receivableFollowUp={search.receivableFollowUp}
      scheduleNo={search.scheduleNo}
    />
  )
}
