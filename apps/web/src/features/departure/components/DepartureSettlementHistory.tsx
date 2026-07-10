import { Timeline, Typography } from 'antd'
import type { DepartureSettlementHistoryItem } from '@/types/api'

function formatOperatedAt(value: string): string {
  return new Date(value).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

interface DepartureSettlementHistoryProps {
  items: DepartureSettlementHistoryItem[]
}

export function DepartureSettlementHistory({ items }: DepartureSettlementHistoryProps) {
  if (items.length === 0) {
    return null
  }

  return (
    <div style={{ marginTop: 16 }}>
      <Typography.Text strong>结清撤销履历</Typography.Text>
      <Timeline
        style={{ marginTop: 12, marginBottom: 0 }}
        items={items.map((item) => ({
          color: 'orange',
          children: (
            <div>
              <Typography.Text>
                撤销已结清
                {' · '}
                触发节点 {item.triggerScheduleNo}
                {' · '}
                {item.operatedByName || '-'}
                {' · '}
                {formatOperatedAt(item.operatedAt)}
              </Typography.Text>
              <div>
                <Typography.Text type="secondary">原因：{item.reason}</Typography.Text>
              </div>
            </div>
          ),
        }))}
      />
    </div>
  )
}
