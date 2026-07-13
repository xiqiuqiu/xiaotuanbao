import { PaymentScheduleWorkspace } from '../components/PaymentScheduleWorkspace'

export function ReceivablesPage() {
  return (
    <PaymentScheduleWorkspace
      scope="global"
      direction="receivable"
      readOnly={false}
      pageHeader={{ title: '应收管理' }}
    />
  )
}
