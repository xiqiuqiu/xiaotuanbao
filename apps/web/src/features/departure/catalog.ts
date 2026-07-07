import {
  DepartureStatus,
  SegmentPayableStatus,
  SourceOrderCollectionMode,
  SourceOrderDiscountType,
  SourceOrderReceivableStatus,
  GuestGender,
} from '@xiaotuanbao/shared'

export const DEPARTURE_STATUS_OPTIONS = [
  { value: DepartureStatus.EDITING, label: '编辑中' },
  { value: DepartureStatus.PENDING_SETTLEMENT, label: '待结算' },
  { value: DepartureStatus.SETTLED, label: '已结清' },
  { value: DepartureStatus.CLOSED, label: '已关闭' },
] as const

export const DEPARTURE_STATUS_LABELS = Object.fromEntries(
  DEPARTURE_STATUS_OPTIONS.map((item) => [item.value, item.label]),
) as Record<DepartureStatus, string>

export const DEPARTURE_STATUS_COLORS: Record<DepartureStatus, string> = {
  [DepartureStatus.EDITING]: 'processing',
  [DepartureStatus.PENDING_SETTLEMENT]: 'warning',
  [DepartureStatus.SETTLED]: 'success',
  [DepartureStatus.CLOSED]: 'default',
}

export function catalogLabel(
  labels: Record<string, string>,
  value: string | null | undefined,
): string {
  if (!value) {
    return '—'
  }
  return labels[value] ?? value
}

export const DEPARTURE_TYPE_OPTIONS = [
  { value: 'independent', label: '独立团' },
  { value: 'combined', label: '拼团' },
] as const

export const DEPARTURE_TYPE_LABELS = Object.fromEntries(
  DEPARTURE_TYPE_OPTIONS.map((item) => [item.value, item.label]),
) as Record<string, string>

export const DEPARTURE_PROGRESS_OPTIONS = [
  { value: 'not_started', label: '未开始' },
  { value: 'in_progress', label: '进行中' },
  { value: 'ended', label: '已结束' },
] as const

export const DEPARTURE_PROGRESS_LABELS = Object.fromEntries(
  DEPARTURE_PROGRESS_OPTIONS.map((item) => [item.value, item.label]),
) as Record<string, string>

export const DEPARTURE_PROGRESS_COLORS: Record<string, string> = {
  not_started: 'default',
  in_progress: 'processing',
  ended: 'success',
}

export const DEPARTURE_DETAIL_TABS = [
  { key: 'overview', label: '概览' },
  { key: 'sourceOrders', label: '客源管理' },
  { key: 'segments', label: '行程段' },
  { key: 'resources', label: '资源安排' },
  { key: 'receivables', label: '应收管理' },
  { key: 'payables', label: '应付管理' },
  { key: 'verifications', label: '核销记录' },
] as const

export type DepartureDetailTabKey = (typeof DEPARTURE_DETAIL_TABS)[number]['key']

export function isDepartureDetailTabKey(value: string | undefined): value is DepartureDetailTabKey {
  return DEPARTURE_DETAIL_TABS.some((tab) => tab.key === value)
}

export function formatCents(cents: number): string {
  return `¥${(cents / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function renderCompletionTags(tags: {
  sourceOrders: string
  segments: string
  resources: string
  receivables: string
  payables: string
}) {
  return [
    tags.sourceOrders,
    tags.segments,
    tags.resources,
    tags.receivables,
    tags.payables,
  ].map((label) => ({ label }))
}

export const SOURCE_ORDER_COLLECTION_OPTIONS = [
  { value: SourceOrderCollectionMode.GUEST_ONLY, label: '全部我方代收' },
  { value: SourceOrderCollectionMode.SPLIT, label: '客户已收 + 我方代收' },
  { value: SourceOrderCollectionMode.PARTNER_SETTLED, label: '客户结算' },
] as const

export const SOURCE_ORDER_COLLECTION_LABELS = Object.fromEntries(
  SOURCE_ORDER_COLLECTION_OPTIONS.map((item) => [item.value, item.label]),
) as Record<string, string>

export const SOURCE_ORDER_DISCOUNT_OPTIONS = [
  { value: SourceOrderDiscountType.NONE, label: '无优惠' },
  { value: SourceOrderDiscountType.LUMP_SUM, label: '整单优惠' },
] as const

export const SOURCE_ORDER_RECEIVABLE_STATUS_LABELS: Record<string, string> = {
  [SourceOrderReceivableStatus.NOT_GENERATED]: '未生成',
  [SourceOrderReceivableStatus.PENDING]: '待收',
  [SourceOrderReceivableStatus.PARTIAL]: '部分收款',
  [SourceOrderReceivableStatus.COLLECTED]: '已收齐',
}

export const GUEST_GENDER_OPTIONS = [
  { value: GuestGender.MALE, label: '男' },
  { value: GuestGender.FEMALE, label: '女' },
  { value: GuestGender.UNKNOWN, label: '未知' },
] as const

export const GUEST_GENDER_LABELS = Object.fromEntries(
  GUEST_GENDER_OPTIONS.map((item) => [item.value, item.label]),
) as Record<string, string>

export const SEGMENT_PAYABLE_STATUS_LABELS: Record<string, string> = {
  [SegmentPayableStatus.NOT_GENERATED]: '未生成',
  [SegmentPayableStatus.PENDING]: '待付',
  [SegmentPayableStatus.PARTIAL]: '部分付款',
  [SegmentPayableStatus.PAID]: '已付清',
}

export const SEGMENT_PAYABLE_OVERVIEW_LABELS: Record<string, string> = {
  [SegmentPayableStatus.NOT_GENERATED]: '应付未生成',
  [SegmentPayableStatus.PENDING]: '应付待付',
  [SegmentPayableStatus.PARTIAL]: '应付部分付款',
  [SegmentPayableStatus.PAID]: '应付已付清',
}

export const RESOURCE_KIND_OPTIONS = [
  { value: 'transport', label: '用车' },
  { value: 'hotel', label: '酒店' },
  { value: 'guide', label: '导游' },
  { value: 'ticket', label: '门票' },
  { value: 'meal', label: '餐' },
  { value: 'outsource', label: '拼出' },
  { value: 'other', label: '其他' },
] as const

export const RESOURCE_KIND_LABELS = Object.fromEntries(
  RESOURCE_KIND_OPTIONS.map((item) => [item.value, item.label]),
) as Record<string, string>
