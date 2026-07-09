import { request } from '@/lib/request'
import type { SupplierListResult, SupplierSummary } from '@/types/api'
import type {
  DirectoryProfileStatus,
  InvoiceAvailable,
  InvoiceType,
  SettlementCycle,
  SettlementMethod,
  SupplierAllowedResourceKind,
} from '@xiaotuanbao/shared'

export interface ListSuppliersParams {
  search?: string
  /** Filter suppliers whose categories contain this ResourceKind. */
  category?: SupplierAllowedResourceKind
  status?: DirectoryProfileStatus
  includeArchived?: boolean
  page?: number
  pageSize?: number
}

export interface CreateSupplierPayload {
  name: string
  categories: SupplierAllowedResourceKind[]
  contactName?: string
  contactPhone?: string
  settlementMethod?: SettlementMethod
  settlementCycle?: SettlementCycle
  settlementNotes?: string
  referenceQuoteNotes?: string
  invoiceAvailable?: InvoiceAvailable
  invoiceType?: InvoiceType
  taxRate?: string
  accountName?: string
  bankName?: string
  bankAccount?: string
  businessNotes?: string
}

export interface UpdateSupplierPayload extends CreateSupplierPayload {
  status: DirectoryProfileStatus
}

export async function listSuppliers(params: ListSuppliersParams): Promise<SupplierListResult> {
  return request.get<SupplierListResult>('/suppliers', { params })
}

export async function getSupplier(id: string): Promise<SupplierSummary> {
  return request.get<SupplierSummary>(`/suppliers/${id}`)
}

export async function createSupplier(payload: CreateSupplierPayload): Promise<SupplierSummary> {
  return request.post<SupplierSummary>('/suppliers', payload)
}

export async function updateSupplier(
  id: string,
  payload: UpdateSupplierPayload,
): Promise<SupplierSummary> {
  return request.patch<SupplierSummary>(`/suppliers/${id}`, payload)
}

export async function archiveSupplier(id: string): Promise<SupplierSummary> {
  return request.post<SupplierSummary>(`/suppliers/${id}/archive`)
}

export async function restoreSupplier(id: string): Promise<SupplierSummary> {
  return request.post<SupplierSummary>(`/suppliers/${id}/restore`)
}
