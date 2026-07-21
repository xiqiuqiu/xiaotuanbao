import { useSearch } from '@tanstack/react-router'
import { PaymentScheduleWorkspace } from '../components/PaymentScheduleWorkspace'
import type { PayableListSearch } from '../utils/payable-list-search'

export function PayablesPage() {
  const search = useSearch({ strict: false }) as PayableListSearch

  return (
    <PaymentScheduleWorkspace
      scope="global"
      direction="payable"
      readOnly={false}
      pageHeader={{ title: '应付管理' }}
      payableBalance={search.payableBalance}
      scheduleNo={search.scheduleNo}
    />
  )
}
