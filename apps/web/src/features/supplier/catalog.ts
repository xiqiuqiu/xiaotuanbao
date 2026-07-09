import {
  InvoiceAvailable,
  InvoiceType,
  RESOURCE_KIND_OPTIONS,
  SUPPLIER_ALLOWED_RESOURCE_KINDS,
  type SupplierAllowedResourceKind,
} from '@xiaotuanbao/shared'

export {
  DIRECTORY_PROFILE_STATUS_OPTIONS,
  DIRECTORY_PROFILE_STATUS_LABELS,
  SETTLEMENT_METHOD_OPTIONS,
  SETTLEMENT_METHOD_LABELS,
  SETTLEMENT_CYCLE_OPTIONS,
  SETTLEMENT_CYCLE_LABELS,
  catalogLabel,
} from '../directory/catalog'

export type { SupplierAllowedResourceKind }

/** Supplier-allowed resource kinds with unified labels (用车/餐/门票). */
export const SUPPLIER_CATEGORY_OPTIONS = RESOURCE_KIND_OPTIONS.filter((item) =>
  (SUPPLIER_ALLOWED_RESOURCE_KINDS as readonly string[]).includes(item.value),
)

export const SUPPLIER_CATEGORY_LABELS = Object.fromEntries(
  SUPPLIER_CATEGORY_OPTIONS.map((item) => [item.value, item.label]),
) as Record<SupplierAllowedResourceKind, string>

export const INVOICE_AVAILABLE_OPTIONS = [
  { value: InvoiceAvailable.YES, label: '是' },
  { value: InvoiceAvailable.NO, label: '否' },
] as const

export const INVOICE_TYPE_OPTIONS = [
  { value: InvoiceType.NORMAL, label: '普票' },
  { value: InvoiceType.SPECIAL, label: '专票' },
  { value: InvoiceType.UNSUPPORTED, label: '不支持' },
] as const

export const INVOICE_AVAILABLE_LABELS = Object.fromEntries(
  INVOICE_AVAILABLE_OPTIONS.map((item) => [item.value, item.label]),
) as Record<InvoiceAvailable, string>

export const INVOICE_TYPE_LABELS = Object.fromEntries(
  INVOICE_TYPE_OPTIONS.map((item) => [item.value, item.label]),
) as Record<InvoiceType, string>
