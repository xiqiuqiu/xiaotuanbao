import type { DepartureDetail } from '@/types/api'
import { DepartureOverviewStatsCards } from './DepartureOverviewStatsCards'

interface DepartureOverviewProps {
  departure: DepartureDetail
}

export function DepartureOverview({ departure }: DepartureOverviewProps) {
  return <DepartureOverviewStatsCards departure={departure} />
}
