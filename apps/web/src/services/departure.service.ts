import { downloadBinary, request, triggerBrowserDownload } from '@/lib/request'
import type {
  CopyDepartureDto,
  CreateDepartureDto,
  CloseDepartureDto,
  DepartureDetail,
  DepartureListResult,
  DepartureOperationsSheetSnapshot,
  DepartureRouteNamesResult,
  DepartureSummary,
  RouteLedgerResult,
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
  operationalWindow?: 'in_progress' | 'next_7_days' | 'current_and_next_7_days'
  departureDataGap?: 'any'
  settlementReadiness?: 'ready'
  accountGenerationGap?: 'any' | 'payable' | 'receivable'
  excludeClosed?: '1'
  startDateFrom?: string
  startDateTo?: string
  page?: number
  pageSize?: number
}

export async function listDepartures(
  params: ListDeparturesParams,
  signal?: AbortSignal,
): Promise<DepartureListResult> {
  return request.get<DepartureListResult>('/departures', { params, signal })
}

export async function listDepartureRouteNames(
  signal?: AbortSignal,
): Promise<DepartureRouteNamesResult> {
  return request.get<DepartureRouteNamesResult>('/departures/route-names', { signal })
}

export interface GetRouteLedgerParams {
  routeName?: string
  startDateFrom?: string
  startDateTo?: string
}

export async function getDepartureRouteLedger(
  params: GetRouteLedgerParams,
  signal?: AbortSignal,
): Promise<RouteLedgerResult> {
  return request.get<RouteLedgerResult>('/departures/route-ledger', { params, signal })
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

/** Departure Purge：删除无客源且无财务痕迹的误建发团。 */
export async function purgeDeparture(id: string): Promise<void> {
  await request.delete(`/departures/${id}`)
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
