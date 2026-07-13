import { PaymentScheduleWorkspace } from '../components/PaymentScheduleWorkspace'

export function PayablesPage() {
  return (
    <PaymentScheduleWorkspace
      scope="global"
      direction="payable"
      readOnly={false}
      pageHeader={{
        title: '应付管理',
        description: '全局应付节点：登记付款、匹配流水、关闭节点',
      }}
    />
  )
}
