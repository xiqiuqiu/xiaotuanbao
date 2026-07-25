import {
  InvoiceAvailable,
  InvoiceType,
  ResourceKind,
  RESOURCE_KIND_OPTIONS,
  SUPPLIER_ALLOWED_RESOURCE_KINDS,
  SUPPLIER_CATEGORY_OUTSOURCE_LABEL,
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

/** Supplier-allowed resource kinds; outsource shown as 旅行社 (resource kind stays 拼出). */
export const SUPPLIER_CATEGORY_OPTIONS = RESOURCE_KIND_OPTIONS.reduce<
  { value: ResourceKind; label: string }[]
>((options, item) => {
  if (!(SUPPLIER_ALLOWED_RESOURCE_KINDS as readonly string[]).includes(item.value)) {
    return options
  }
  options.push(
    item.value === ResourceKind.OUTSOURCE
      ? { value: item.value, label: SUPPLIER_CATEGORY_OUTSOURCE_LABEL }
      : item,
  )
  return options
}, [])

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
