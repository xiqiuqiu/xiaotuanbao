import { request } from '@/lib/request'
import type {
  CreateSegmentResourceDto,
  BatchFinanceGenerationResult,
  GeneratePayableResult,
  SegmentResourceListResult,
  SegmentResourceSummary,
  UpdateSegmentResourceDto,
} from '@/types/api'
import type { ResourceKind, SegmentPayableStatus } from '@xiaotuanbao/shared'

export interface ListSegmentResourcesParams {
  resourceKind?: ResourceKind
  payableStatus?: SegmentPayableStatus
  keyword?: string
}

export async function listSegmentResources(
  segmentId: string,
  params: ListSegmentResourcesParams = {},
): Promise<SegmentResourceListResult> {
  return request.get<SegmentResourceListResult>(`/segments/${segmentId}/resources`, {
    params,
  })
}

export async function createSegmentResource(
  segmentId: string,
  payload: CreateSegmentResourceDto,
): Promise<SegmentResourceSummary> {
  return request.post<SegmentResourceSummary>(`/segments/${segmentId}/resources`, payload)
}

export async function updateSegmentResource(
  id: string,
  payload: UpdateSegmentResourceDto,
): Promise<SegmentResourceSummary> {
  return request.patch<SegmentResourceSummary>(`/segment-resources/${id}`, payload)
}

export async function deleteSegmentResource(id: string): Promise<void> {
  await request.delete(`/segment-resources/${id}`)
}

export async function generatePayable(resourceId: string): Promise<GeneratePayableResult> {
  return request.post<GeneratePayableResult>(`/segment-resources/${resourceId}/generate-payable`)
}

export async function generatePayablesForSegment(
  segmentId: string,
): Promise<BatchFinanceGenerationResult> {
  return request.post<BatchFinanceGenerationResult>(
    `/segments/${segmentId}/generate-payables`,
  )
}
