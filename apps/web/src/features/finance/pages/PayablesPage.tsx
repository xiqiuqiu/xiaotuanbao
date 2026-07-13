import { PaymentScheduleWorkspace } from '../components/PaymentScheduleWorkspace'

export function PayablesPage() {
  return (
    <PaymentScheduleWorkspace
      scope="global"
      direction="payable"
      readOnly={false}
      pageHeader={{ title: '应付管理' }}
    />
  )
}
