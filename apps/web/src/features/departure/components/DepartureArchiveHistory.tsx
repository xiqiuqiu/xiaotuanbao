import { Timeline, Typography } from 'antd'
import { DepartureArchiveAction } from '@xiaotuanbao/shared'
import type { DepartureArchiveHistoryItem } from '@/types/api'

const ACTION_LABELS: Record<string, string> = {
  [DepartureArchiveAction.ARCHIVE]: '归档',
  [DepartureArchiveAction.UNARCHIVE]: '解除归档',
}

function formatOperatedAt(value: string): string {
  return new Date(value).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

interface DepartureArchiveHistoryProps {
  items: DepartureArchiveHistoryItem[]
}

export function DepartureArchiveHistory({ items }: DepartureArchiveHistoryProps) {
  if (items.length === 0) {
    return null
  }

  return (
    <div style={{ marginTop: 16 }}>
      <Typography.Text strong>归档履历</Typography.Text>
      <Timeline
        style={{ marginTop: 12, marginBottom: 0 }}
        items={items.map((item) => ({
          color: item.action === DepartureArchiveAction.ARCHIVE ? 'gray' : 'blue',
          children: (
            <div>
              <Typography.Text>
                {ACTION_LABELS[item.action] ?? item.action}
                {' · '}
                {item.operatedByName || '—'}
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
