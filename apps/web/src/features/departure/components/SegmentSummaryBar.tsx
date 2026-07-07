import { Button, Typography } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import type { ItinerarySegmentListSummary } from '@/types/api'
import { SEGMENT_PAYABLE_OVERVIEW_LABELS, catalogLabel } from '../catalog'

interface SegmentSummaryBarProps {
  summary: ItinerarySegmentListSummary
  readOnly: boolean
  onAdd: () => void
}

export function SegmentSummaryBar({ summary, readOnly, onAdd }: SegmentSummaryBarProps) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
        gap: 16,
        flexWrap: 'wrap',
      }}
    >
      <Typography.Paragraph style={{ marginBottom: 0 }}>
        <Typography.Text strong>行程{summary.segmentCount}段</Typography.Text>
        {' · '}
        共{summary.totalDays}天
        {' · '}
        资源{summary.resourceCount}项
        {' · '}
        {catalogLabel(SEGMENT_PAYABLE_OVERVIEW_LABELS, summary.payableOverview)}
      </Typography.Paragraph>

      {!readOnly ? (
        <Button type="primary" icon={<PlusOutlined />} onClick={onAdd}>
          添加行程段
        </Button>
      ) : null}
    </div>
  )
}
