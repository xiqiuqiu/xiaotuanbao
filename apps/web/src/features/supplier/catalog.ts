import {
  DirectoryProfileStatus,
  InvoiceAvailable,
  InvoiceType,
  SettlementCycle,
  SettlementMethod,
  SupplierCategory,
} from '@xiaotuanbao/shared'

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

export const DIRECTORY_PROFILE_STATUS_OPTIONS = [
  { value: DirectoryProfileStatus.ACTIVE, label: '启用' },
  { value: DirectoryProfileStatus.DISABLED, label: '停用' },
] as const

export const DIRECTORY_PROFILE_STATUS_LABELS: Record<string, string> = {
  [DirectoryProfileStatus.ACTIVE]: '启用',
  [DirectoryProfileStatus.DISABLED]: '停用',
  [DirectoryProfileStatus.ARCHIVED]: '已归档',
}

export const SETTLEMENT_METHOD_OPTIONS = [
  { value: SettlementMethod.CASH, label: '现结' },
  { value: SettlementMethod.PREPAY, label: '预付' },
  { value: SettlementMethod.POSTPAY, label: '挂账后结' },
] as const

export const SETTLEMENT_METHOD_LABELS = Object.fromEntries(
  SETTLEMENT_METHOD_OPTIONS.map((item) => [item.value, item.label]),
) as Record<SettlementMethod, string>

export const SETTLEMENT_CYCLE_OPTIONS = [
  { value: SettlementCycle.PER_GROUP, label: '每团结' },
  { value: SettlementCycle.WEEKLY, label: '周结' },
  { value: SettlementCycle.SEMI_MONTHLY, label: '半月结' },
  { value: SettlementCycle.MONTHLY, label: '月结' },
  { value: SettlementCycle.AS_AGREED, label: '按约定' },
] as const

export const SETTLEMENT_CYCLE_LABELS = Object.fromEntries(
  SETTLEMENT_CYCLE_OPTIONS.map((item) => [item.value, item.label]),
) as Record<SettlementCycle, string>

export const INVOICE_AVAILABLE_OPTIONS = [
  { value: InvoiceAvailable.YES, label: '是' },
  { value: InvoiceAvailable.NO, label: '否' },
] as const

export const INVOICE_TYPE_OPTIONS = [
  { value: InvoiceType.NORMAL, label: '普票' },
  { value: InvoiceType.SPECIAL, label: '专票' },
  { value: InvoiceType.UNSUPPORTED, label: '不支持' },
] as const

export function catalogLabel(
  labels: Record<string, string>,
  value: string | null | undefined,
): string {
  if (!value) {
    return '—'
  }
  return labels[value] ?? value
}
