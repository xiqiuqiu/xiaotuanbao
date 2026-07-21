import { request } from '@/lib/request'
import type {
  SupplierListResult,
  SupplierServiceOrderListResult,
  SupplierSummary,
} from '@/types/api'
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

export async function listSuppliers(
  params: ListSuppliersParams,
  signal?: AbortSignal,
): Promise<SupplierListResult> {
  return request.get<SupplierListResult>('/suppliers', { params, signal })
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

export interface ListSupplierServiceOrdersParams {
  departureDateFrom?: string
  departureDateTo?: string
  page?: number
  pageSize?: number
}

/** 服务团单 Tab：按 Supplier 跨发团查询非拼出资源行（业务事实层）。 */
export async function listSupplierServiceOrders(
  supplierId: string,
  params: ListSupplierServiceOrdersParams = {},
): Promise<SupplierServiceOrderListResult> {
  return request.get<SupplierServiceOrderListResult>(
    `/suppliers/${supplierId}/service-orders`,
    { params },
  )
}
