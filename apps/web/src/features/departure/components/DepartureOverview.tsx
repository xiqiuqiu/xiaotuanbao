import type { DepartureDetail } from '@/types/api'
import { DepartureOverviewStatsCards } from './DepartureOverviewStatsCards'

interface DepartureOverviewProps {
  departure: DepartureDetail
  animateProgress: boolean
}

export function DepartureOverview({ departure, animateProgress }: DepartureOverviewProps) {
  return (
    <DepartureOverviewStatsCards departure={departure} animateProgress={animateProgress} />
  )
}
