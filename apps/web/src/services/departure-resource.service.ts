import { request } from '@/lib/request'
import type {
  CreateDepartureResourceDto,
  DepartureResourceListResult,
  DepartureResourceSummary,
  GenerateDeparturePayableResult,
  UpdateDepartureResourceDto,
} from '@/types/api'
import type { ResourceKind, SegmentPayableStatus } from '@xiaotuanbao/shared'

export interface ListDepartureResourcesParams {
  resourceKind?: ResourceKind
  payableStatus?: SegmentPayableStatus
  keyword?: string
}

export async function listDepartureResources(
  departureId: string,
  params: ListDepartureResourcesParams = {},
  signal?: AbortSignal,
): Promise<DepartureResourceListResult> {
  return request.get<DepartureResourceListResult>(`/departures/${departureId}/resources`, {
    params,
    signal,
  })
}

export async function createDepartureResource(
  departureId: string,
  payload: CreateDepartureResourceDto,
): Promise<DepartureResourceSummary> {
  return request.post<DepartureResourceSummary>(`/departures/${departureId}/resources`, payload)
}

export async function updateDepartureResource(
  id: string,
  payload: UpdateDepartureResourceDto,
): Promise<DepartureResourceSummary> {
  return request.patch<DepartureResourceSummary>(`/departure-resources/${id}`, payload)
}

export async function deleteDepartureResource(id: string): Promise<void> {
  await request.delete(`/departure-resources/${id}`)
}

export async function generateDeparturePayable(
  resourceId: string,
): Promise<GenerateDeparturePayableResult> {
  return request.post<GenerateDeparturePayableResult>(
    `/departure-resources/${resourceId}/generate-payable`,
  )
}
