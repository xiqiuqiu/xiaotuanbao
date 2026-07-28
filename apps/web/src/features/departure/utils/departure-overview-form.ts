import type { DepartureDetail, UpdateDepartureDto } from '@/types/api'
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
  driverSupplierId?: string
  guideSupplierId?: string
  vehiclePlate?: string
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
    driverSupplierId: departure.driverSupplierId ?? undefined,
    guideSupplierId: departure.guideSupplierId ?? undefined,
    vehiclePlate: departure.vehiclePlate ?? undefined,
    notes: departure.notes ?? undefined,
  }
}

export function buildUpdateDeparturePayload(
  values: DepartureOverviewFormValues,
): UpdateDepartureDto {
  return {
    name: values.name,
    routeName: values.routeName,
    departureType: values.departureType,
    startDate: values.startDate,
    endDate: values.endDate,
    ownerUserId: values.ownerUserId,
    driverSupplierId: values.driverSupplierId ?? null,
    guideSupplierId: values.guideSupplierId ?? null,
    vehiclePlate: values.vehiclePlate ?? null,
    notes: values.notes ?? null,
  }
}
