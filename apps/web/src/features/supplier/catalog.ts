import {
  InvoiceAvailable,
  InvoiceType,
  SupplierCategory,
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

export const SUPPLIER_CATEGORY_OPTIONS = [
  { value: SupplierCategory.RESTAURANT, label: '餐厅' },
  { value: SupplierCategory.HOTEL, label: '酒店' },
  { value: SupplierCategory.TRANSPORT, label: '车队' },
  { value: SupplierCategory.GUIDE, label: '导游' },
  { value: SupplierCategory.SCENIC, label: '景区' },
  { value: SupplierCategory.SHOP, label: '购物店' },
  { value: SupplierCategory.ENTERTAINMENT, label: '演出' },
  { value: SupplierCategory.INSURANCE, label: '保险' },
  { value: SupplierCategory.TICKET, label: '票务' },
  { value: SupplierCategory.OTHER, label: '其他' },
] as const

export const SUPPLIER_CATEGORY_LABELS = Object.fromEntries(
  SUPPLIER_CATEGORY_OPTIONS.map((item) => [item.value, item.label]),
) as Record<SupplierCategory, string>

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
