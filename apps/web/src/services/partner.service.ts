import { request } from '@/lib/request'
import type { PartnerListResult, PartnerSummary } from '@/types/api'
import type {
  PartnerContactRole,
  PartnerKind,
  PartnerType,
  SettlementCycle,
  SettlementMethod,
} from '@xiaotuanbao/shared'

export interface ListPartnersParams {
  search?: string
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

export async function listPartners(params: ListPartnersParams): Promise<PartnerListResult> {
  return request.get<PartnerListResult>('/partners', { params })
}

export async function createPartner(payload: CreatePartnerPayload): Promise<PartnerSummary> {
  return request.post<PartnerSummary>('/partners', payload)
}
