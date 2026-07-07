import { request } from '@/lib/request'
import type { SupplierListResult, SupplierSummary } from '@/types/api'
import type {
  DirectoryProfileStatus,
  InvoiceAvailable,
  InvoiceType,
  SettlementCycle,
  SettlementMethod,
  SupplierCategory,
} from '@xiaotuanbao/shared'

export interface ListSuppliersParams {
  search?: string
  category?: SupplierCategory
  status?: DirectoryProfileStatus
  includeArchived?: boolean
  page?: number
  pageSize?: number
}

export interface CreateSupplierPayload {
  name: string
  category: SupplierCategory
  status?: DirectoryProfileStatus
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

export async function listSuppliers(params: ListSuppliersParams): Promise<SupplierListResult> {
  return request.get<SupplierListResult>('/suppliers', { params })
}

export async function createSupplier(payload: CreateSupplierPayload): Promise<SupplierSummary> {
  return request.post<SupplierSummary>('/suppliers', payload)
}
