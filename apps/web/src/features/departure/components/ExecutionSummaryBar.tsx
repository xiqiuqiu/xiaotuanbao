import { Alert } from 'antd'
import type { ItinerarySegmentListSummary } from '@/types/api'
import { SEGMENT_PAYABLE_OVERVIEW_LABELS, catalogLabel } from '../catalog'

interface ExecutionSummaryBarProps {
  summary: ItinerarySegmentListSummary
}

/** 顶部提示区：段数 · 资源项 · 应付概况 */
export function ExecutionSummaryBar({ summary }: ExecutionSummaryBarProps) {
  return (
    <Alert
      type="info"
      showIcon
      style={{ marginBottom: 16 }}
      title={
        <>
          {summary.segmentCount} 段
          {' · '}
          {summary.resourceCount} 项资源
          {' · '}
          {catalogLabel(SEGMENT_PAYABLE_OVERVIEW_LABELS, summary.payableOverview)}
        </>
      }
    />
  )
}
