import { Typography } from 'antd'
import { PaymentScheduleWorkspace } from '../components/PaymentScheduleWorkspace'

export function ReceivablesPage() {
  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Typography.Title level={4} style={{ marginTop: 0, marginBottom: 4 }}>
          应收管理
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
          全局应收节点：登记收款、匹配流水、关闭节点
        </Typography.Paragraph>
      </div>
      <PaymentScheduleWorkspace scope="global" direction="receivable" readOnly={false} />
    </div>
  )
}
