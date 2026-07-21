import { request } from '@/lib/request'
import type { PartnerListResult, PartnerSummary } from '@/types/api'
import type {
  DirectoryProfileStatus,
  PartnerContactRole,
  PartnerKind,
  PartnerType,
  SettlementCycle,
  SettlementMethod,
} from '@xiaotuanbao/shared'

export interface ListPartnersParams {
  search?: string
  partnerKind?: PartnerKind
  partnerType?: PartnerType
  status?: DirectoryProfileStatus
  includeArchived?: boolean
  page?: number
  pageSize?: number
}

export interface CreatePartnerPayload {
  name: string
  partnerKind: PartnerKind
  partnerType: PartnerType
  contactName?: string
  contactRole?: PartnerContactRole
  contactPhone?: string
  settlementMethod?: SettlementMethod
  paymentTermRule?: SettlementCycle
  settlementNotes?: string
}

export interface UpdatePartnerPayload extends CreatePartnerPayload {
  status: DirectoryProfileStatus
}

export async function listPartners(
  params: ListPartnersParams,
  signal?: AbortSignal,
): Promise<PartnerListResult> {
  return request.get<PartnerListResult>('/partners', { params, signal })
}

export async function getPartner(id: string): Promise<PartnerSummary> {
  return request.get<PartnerSummary>(`/partners/${id}`)
}

export async function createPartner(payload: CreatePartnerPayload): Promise<PartnerSummary> {
  return request.post<PartnerSummary>('/partners', payload)
}

export async function updatePartner(
  id: string,
  payload: UpdatePartnerPayload,
): Promise<PartnerSummary> {
  return request.patch<PartnerSummary>(`/partners/${id}`, payload)
}

export async function archivePartner(id: string): Promise<PartnerSummary> {
  return request.post<PartnerSummary>(`/partners/${id}/archive`)
}

export async function restorePartner(id: string): Promise<PartnerSummary> {
  return request.post<PartnerSummary>(`/partners/${id}/restore`)
}
