import {
  InvoiceAvailable,
  InvoiceType,
  ResourceKind,
  RESOURCE_KIND_LABELS,
  SUPPLIER_ALLOWED_RESOURCE_KINDS,
  SUPPLIER_CATEGORY_MEAL_LABEL,
  SUPPLIER_CATEGORY_OUTSOURCE_LABEL,
  SUPPLIER_CATEGORY_SORT_ORDER,
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

function supplierCategoryLabel(kind: ResourceKind): string {
  if (kind === ResourceKind.OUTSOURCE) return SUPPLIER_CATEGORY_OUTSOURCE_LABEL
  if (kind === ResourceKind.MEAL) return SUPPLIER_CATEGORY_MEAL_LABEL
  return RESOURCE_KIND_LABELS[kind]
}

/**
 * Supplier-allowed resource kinds with supplier-only labels/order:
 * outsource → 旅行社, meal → 用餐; 旅行社 in first five (resource kinds unchanged).
 */
export const SUPPLIER_CATEGORY_OPTIONS = SUPPLIER_CATEGORY_SORT_ORDER.reduce<
  { value: ResourceKind; label: string }[]
>((options, kind) => {
  if (!(SUPPLIER_ALLOWED_RESOURCE_KINDS as readonly string[]).includes(kind)) {
    return options
  }
  options.push({ value: kind, label: supplierCategoryLabel(kind) })
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
