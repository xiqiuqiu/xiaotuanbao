import { Typography } from 'antd'
import type { ItinerarySegmentListSummary } from '@/types/api'
import { SEGMENT_PAYABLE_OVERVIEW_LABELS, catalogLabel } from '../catalog'

interface ExecutionSummaryBarProps {
  summary: ItinerarySegmentListSummary
}

/** 极简汇总：段数 · 资源项 · 应付概况（无主按钮） */
export function ExecutionSummaryBar({ summary }: ExecutionSummaryBarProps) {
  return (
    <Typography.Paragraph style={{ marginBottom: 16 }}>
      <Typography.Text strong>{summary.segmentCount} 段</Typography.Text>
      {' · '}
      {summary.resourceCount} 项资源
      {' · '}
      {catalogLabel(SEGMENT_PAYABLE_OVERVIEW_LABELS, summary.payableOverview)}
    </Typography.Paragraph>
  )
}
