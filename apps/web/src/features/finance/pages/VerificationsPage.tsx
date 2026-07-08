import { Typography } from 'antd'
import { useSearch } from '@tanstack/react-router'
import { VerificationsWorkspace } from '../components/VerificationsWorkspace'

export function VerificationsPage() {
  const search = useSearch({ strict: false }) as {
    paymentScheduleId?: string
    transactionId?: string
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <Typography.Title level={4} style={{ marginTop: 0, marginBottom: 4 }}>
            核销管理
          </Typography.Title>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
            将财务流水与账款节点进行核销匹配
          </Typography.Paragraph>
        </div>
      </div>

      <VerificationsWorkspace
        scope="global"
        initialPaymentScheduleId={search.paymentScheduleId}
        initialTransactionId={search.transactionId}
      />
    </div>
  )
}
