import type { DepartureDetail } from '@/types/api'
import { DepartureType } from '@xiaotuanbao/shared'

export interface DepartureOverviewFormValues {
  departureNo: string
  name: string
  routeName: string
  departureType: DepartureType
  startDate: string
  endDate: string
  dayCount: number
  ownerUserId: string
  notes?: string
}

export function departureToFormValues(departure: DepartureDetail): DepartureOverviewFormValues {
  return {
    departureNo: departure.departureNo,
    name: departure.name,
    routeName: departure.routeName,
    departureType: departure.departureType as DepartureType,
    startDate: departure.startDate,
    endDate: departure.endDate,
    dayCount: departure.dayCount,
    ownerUserId: departure.ownerUserId,
    notes: departure.notes ?? undefined,
  }
}
