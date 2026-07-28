import { Drawer, Empty, Timeline, Typography } from 'antd'
import { formatBusinessDateTime } from '@/utils/formatBusinessDateTime'
import {
  mergeDepartureHistoryItems,
  type DepartureHistoryItem,
} from '../utils/departure-history'
import type {
  DepartureArchiveHistoryItem,
  DepartureSettlementHistoryItem,
} from '@/types/api'

type DepartureHistoryDrawerProps = {
  open: boolean
  onClose: () => void
  archiveHistory: DepartureArchiveHistoryItem[]
  settlementHistory: DepartureSettlementHistoryItem[]
}

function HistoryTimelineItem({ item }: { item: DepartureHistoryItem }) {
  return (
    <div>
      <Typography.Text>
        {item.title}
        {item.detail ? ` · ${item.detail}` : ''}
        {' · '}
        {item.actorName}
        {' · '}
        {formatBusinessDateTime(item.operatedAt)}
      </Typography.Text>
      <div>
        <Typography.Text type="secondary">原因：{item.reason}</Typography.Text>
      </div>
    </div>
  )
}

export function DepartureHistoryDrawer({
  open,
  onClose,
  archiveHistory,
  settlementHistory,
}: DepartureHistoryDrawerProps) {
  const items = mergeDepartureHistoryItems({ archiveHistory, settlementHistory })

  return (
    <Drawer
      title="状态与履历"
      open={open}
      onClose={onClose}
      width={480}
      destroyOnHidden
    >
      {items.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无状态履历" />
      ) : (
        <Timeline
          style={{ marginTop: 8, marginBottom: 0 }}
          items={items.map((item) => ({
            color: item.kind === 'settlement_revert' ? 'orange' : item.title === '归档' ? 'gray' : 'blue',
            children: <HistoryTimelineItem item={item} />,
          }))}
        />
      )}
    </Drawer>
  )
}
