import { Typography } from 'antd'
import { PaymentScheduleWorkspace } from '../components/PaymentScheduleWorkspace'

export function PayablesPage() {
  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Typography.Title level={4} style={{ marginTop: 0, marginBottom: 4 }}>
          应付管理
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
          全局应付节点：登记付款、匹配流水、关闭节点
        </Typography.Paragraph>
      </div>
      <PaymentScheduleWorkspace scope="global" direction="payable" readOnly={false} />
    </div>
  )
}
