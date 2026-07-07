import type { SupplierSummary } from '@/types/api'
import {
  DirectoryProfileStatus,
  InvoiceAvailable,
  type SupplierCategory,
} from '@xiaotuanbao/shared'
import type { SupplierFormValues } from '../components/SupplierProfileSections'

export function toFormValues(supplier: SupplierSummary): SupplierFormValues {
  return {
    name: supplier.name,
    category: supplier.category as SupplierCategory,
    status: supplier.status as DirectoryProfileStatus,
    contactName: supplier.contactName ?? undefined,
    contactPhone: supplier.contactPhone ?? undefined,
    settlementMethod: (supplier.settlementMethod as SupplierFormValues['settlementMethod']) ?? undefined,
    settlementCycle: (supplier.settlementCycle as SupplierFormValues['settlementCycle']) ?? undefined,
    settlementNotes: supplier.settlementNotes ?? undefined,
    referenceQuoteNotes: supplier.referenceQuoteNotes ?? undefined,
    invoiceAvailable: (supplier.invoiceAvailable as SupplierFormValues['invoiceAvailable']) ?? undefined,
    invoiceType: (supplier.invoiceType as SupplierFormValues['invoiceType']) ?? undefined,
    taxRate: supplier.taxRate ?? undefined,
    accountName: supplier.accountName ?? undefined,
    bankName: supplier.bankName ?? undefined,
    bankAccount: supplier.bankAccount ?? undefined,
    businessNotes: supplier.businessNotes ?? undefined,
  }
}

export function buildCreatePayload(values: SupplierFormValues) {
  const { status: _status, ...payload } = buildUpdatePayload(values)
  return payload
}

export function buildUpdatePayload(values: SupplierFormValues) {
  return {
    name: values.name,
    category: values.category,
    status: values.status ?? DirectoryProfileStatus.ACTIVE,
    contactName: values.contactName,
    contactPhone: values.contactPhone,
    settlementMethod: values.settlementMethod,
    settlementCycle: values.settlementCycle,
    settlementNotes: values.settlementNotes,
    referenceQuoteNotes: values.referenceQuoteNotes,
    invoiceAvailable: values.invoiceAvailable,
    invoiceType: values.invoiceType,
    taxRate: values.taxRate,
    accountName: values.accountName,
    bankName: values.bankName,
    bankAccount: values.bankAccount,
    businessNotes: values.businessNotes,
  }
}

export function clearInvoiceFieldsWhenUnavailable<T extends {
  invoiceAvailable?: InvoiceAvailable
  invoiceType?: SupplierFormValues['invoiceType']
  taxRate?: string
}>(payload: T): T {
  if (payload.invoiceAvailable === InvoiceAvailable.NO) {
    return {
      ...payload,
      invoiceType: undefined,
      taxRate: undefined,
    }
  }
  return payload
}
