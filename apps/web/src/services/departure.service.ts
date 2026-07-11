import { downloadBinary, request, triggerBrowserDownload } from '@/lib/request'
import type {
  CopyDepartureDto,
  CreateDepartureDto,
  CloseDepartureDto,
  DepartureDetail,
  DepartureListResult,
  DepartureOperationsSheetSnapshot,
  DepartureSummary,
  TransitionDepartureDto,
  UnarchiveDepartureDto,
  UpdateDepartureDto,
} from '@/types/api'
import type { DepartureStatus, DepartureProgress, DepartureType } from '@xiaotuanbao/shared'

export interface ListDeparturesParams {
  keyword?: string
  routeName?: string
  departureType?: DepartureType
  departureProgress?: DepartureProgress
  status?: DepartureStatus
  ownerUserId?: string
  partnerId?: string
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

export async function previewDepartureNo(): Promise<{ departureNo: string }> {
  return request.get<{ departureNo: string }>('/departures/next-no')
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

export async function closeDeparture(
  id: string,
  payload: CloseDepartureDto,
): Promise<DepartureDetail> {
  return request.post<DepartureDetail>(`/departures/${id}/close`, payload)
}

export async function unarchiveDeparture(
  id: string,
  payload: UnarchiveDepartureDto,
): Promise<DepartureDetail> {
  return request.post<DepartureDetail>(`/departures/${id}/unarchive`, payload)
}

export async function getDepartureOperationsSheet(
  id: string,
): Promise<DepartureOperationsSheetSnapshot> {
  return request.get<DepartureOperationsSheetSnapshot>(`/departures/${id}/operations-sheet`)
}

export async function downloadDepartureOperationsSheet(id: string): Promise<void> {
  const { blob, filename } = await downloadBinary(`/departures/${id}/operations-sheet.xlsx`)
  triggerBrowserDownload(blob, filename ?? `发团运营表_${id}.xlsx`)
}
