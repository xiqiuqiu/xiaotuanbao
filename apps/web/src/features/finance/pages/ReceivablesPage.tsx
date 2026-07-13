import { PaymentScheduleWorkspace } from '../components/PaymentScheduleWorkspace'

export function ReceivablesPage() {
  return (
    <PaymentScheduleWorkspace
      scope="global"
      direction="receivable"
      readOnly={false}
      pageHeader={{
        title: '应收管理',
        description: '全局应收节点：登记收款、匹配流水、关闭节点',
      }}
    />
  )
}
