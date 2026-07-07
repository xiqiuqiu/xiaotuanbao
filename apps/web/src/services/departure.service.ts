import { request } from '@/lib/request'
import type {
  CopyDepartureDto,
  CreateDepartureDto,
  DepartureDetail,
  DepartureListResult,
  DepartureSummary,
  TransitionDepartureDto,
  UpdateDepartureDto,
} from '@/types/api'
import type { DepartureStatus } from '@xiaotuanbao/shared'

export interface ListDeparturesParams {
  keyword?: string
  status?: DepartureStatus
  startDateFrom?: string
  startDateTo?: string
  page?: number
  pageSize?: number
}

export async function listDepartures(params: ListDeparturesParams): Promise<DepartureListResult> {
  return request.get<DepartureListResult>('/departures', { params })
}

export async function createDeparture(payload: CreateDepartureDto): Promise<DepartureSummary> {
  return request.post<DepartureSummary>('/departures', payload)
}

export async function copyDeparture(
  sourceDepartureId: string,
  payload: CopyDepartureDto,
): Promise<DepartureSummary> {
  return request.post<DepartureSummary>(`/departures/${sourceDepartureId}/copy`, payload)
}

export async function previewDepartureNo(
  startDate: string,
): Promise<{ departureNo: string }> {
  return request.get<{ departureNo: string }>('/departures/next-no', {
    params: { startDate },
  })
}

export async function getDeparture(id: string): Promise<DepartureDetail> {
  return request.get<DepartureDetail>(`/departures/${id}`)
}

export async function updateDeparture(
  id: string,
  payload: UpdateDepartureDto,
): Promise<DepartureDetail> {
  return request.patch<DepartureDetail>(`/departures/${id}`, payload)
}

export async function transitionDeparture(
  id: string,
  payload: TransitionDepartureDto,
): Promise<DepartureDetail> {
  return request.post<DepartureDetail>(`/departures/${id}/transition`, payload)
}

export async function closeDeparture(id: string): Promise<DepartureDetail> {
  return request.post<DepartureDetail>(`/departures/${id}/close`)
}
