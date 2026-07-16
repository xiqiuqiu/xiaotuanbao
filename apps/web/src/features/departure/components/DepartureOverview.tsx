import type { DepartureDetail } from '@/types/api'
import { DepartureOverviewStatsCards } from './DepartureOverviewStatsCards'

interface DepartureOverviewProps {
  departure: DepartureDetail
  animateEnter: boolean
}

export function DepartureOverview({ departure, animateEnter }: DepartureOverviewProps) {
  return (
    <DepartureOverviewStatsCards departure={departure} animateEnter={animateEnter} />
  )
}
