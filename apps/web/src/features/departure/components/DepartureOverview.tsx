import { Space } from 'antd'
import type { DepartureDetail } from '@/types/api'
import { DepartureOverviewStatsCards } from './DepartureOverviewStatsCards'
import { GroundIncomeLedger } from './GroundIncomeLedger'

interface DepartureOverviewProps {
  departure: DepartureDetail
  animateEnter: boolean
  mutationLocked: boolean
}

export function DepartureOverview({
  departure,
  animateEnter,
  mutationLocked,
}: DepartureOverviewProps) {
  return (
    <Space orientation="vertical" size={16} style={{ width: '100%' }}>
      <DepartureOverviewStatsCards departure={departure} animateEnter={animateEnter} />
      <GroundIncomeLedger departureId={departure.id} mutationLocked={mutationLocked} />
    </Space>
  )
}
