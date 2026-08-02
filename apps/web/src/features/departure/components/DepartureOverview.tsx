import { Space } from 'antd'
import type { DepartureDetail } from '@/types/api'
import { DepartureOverviewStatsCards } from './DepartureOverviewStatsCards'

interface DepartureOverviewProps {
  departure: DepartureDetail
  animateEnter: boolean
  /** 保留入参以兼容详情页签名；概览已无台账录入区。 */
  mutationLocked: boolean
}

export function DepartureOverview({
  departure,
  animateEnter,
  mutationLocked: _mutationLocked,
}: DepartureOverviewProps) {
  return (
    <Space orientation="vertical" size={16} style={{ width: '100%' }}>
      <DepartureOverviewStatsCards departure={departure} animateEnter={animateEnter} />
    </Space>
  )
}
