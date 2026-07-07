import { request } from '@/lib/request'
import type { CreateDepartureDto, DepartureListResult, DepartureSummary } from '@/types/api'
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
