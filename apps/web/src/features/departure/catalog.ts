import {
  DepartureStatus,
  FareAdjustmentDirection,
  FareAdjustmentKind,
  FARE_ADJUSTMENT_KIND_CATALOG,
  FARE_ADJUSTMENT_KIND_DEFAULT_DIRECTION,
  SegmentPayableStatus,
  SourceOrderCollectionMode,
  SourceOrderDiscountType,
  SourceOrderReceivableStatus,
  GuestGender,
} from '@xiaotuanbao/shared'

export {
  RESOURCE_KIND_OPTIONS,
  RESOURCE_KIND_LABELS,
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
    return '-'
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
  { key: 'execution', label: '执行安排' },
  { key: 'receivables', label: '应收管理' },
  { key: 'payables', label: '应付管理' },
  { key: 'transactions', label: '收支流水' },
  { key: 'verifications', label: '核销记录' },
] as const

export type DepartureDetailTabKey = (typeof DEPARTURE_DETAIL_TABS)[number]['key']

export function isDepartureDetailTabKey(value: string | undefined): value is DepartureDetailTabKey {
  return DEPARTURE_DETAIL_TABS.some((tab) => tab.key === value)
}

/**
 * ADR-0023: 收支流水/核销记录 Tab 显隐由 `/finance/*` menu key 驱动，沿用既有
 * menuKeys 逻辑，不新增平行判断。计调无这两个 menu key 时自动隐藏；其余 Tab 恒显。
 */
export const DEPARTURE_DETAIL_TAB_REQUIRED_MENU_KEY: Partial<
  Record<DepartureDetailTabKey, string>
> = {
  transactions: '/finance/transactions',
  verifications: '/finance/verification',
}

export function isDepartureDetailTabVisible(
  tabKey: DepartureDetailTabKey,
  menuKeys: string[],
): boolean {
  const requiredMenuKey = DEPARTURE_DETAIL_TAB_REQUIRED_MENU_KEY[tabKey]
  return requiredMenuKey === undefined || menuKeys.includes(requiredMenuKey)
}

export function formatCents(cents: number): string {
  return `¥${(cents / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** Finance-not-started progress cells render as em dash (CONTEXT), never as ¥0.00.
 *  Other empty fields use DESIGN.md half-width `-` via call sites. */
export function formatProgressCents(cents: number | null | undefined): string {
  if (cents == null) {
    return '—'
  }
  return formatCents(cents)
}

export const OPERATIONS_SHEET_DATA_STAGE_LABELS: Record<string, string> = {
  not_started: '财务未开始',
  partial: '部分开始',
  active: '已开始',
}

export const OPERATIONS_SHEET_PENDING_DIRECTION_LABELS: Record<string, string> = {
  inflow: '收入',
  outflow: '支出',
}

export const OPERATIONS_SHEET_ANOMALY_KIND_LABELS: Record<string, string> = {
  closed_with_balance: '关闭仍有余额',
  amount_mismatch: '业务/财务金额不一致',
}

export const OPERATIONS_SHEET_ANOMALY_SIDE_LABELS: Record<string, string> = {
  receivable: '应收',
  payable: '应付',
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

export const FARE_ADJUSTMENT_KIND_OPTIONS = [
  ...FARE_ADJUSTMENT_KIND_CATALOG.map((item) => ({
    value: item.kind,
    label: item.label,
  })),
  { value: FareAdjustmentKind.CUSTOM, label: '自定义' },
] as const

export const FARE_ADJUSTMENT_DIRECTION_OPTIONS = [
  { value: FareAdjustmentDirection.INCREASE, label: '增项' },
  { value: FareAdjustmentDirection.DECREASE, label: '减项' },
] as const

export function defaultDirectionForFareAdjustmentKind(
  kind: FareAdjustmentKind,
): FareAdjustmentDirection {
  if (kind === FareAdjustmentKind.CUSTOM) {
    return FareAdjustmentDirection.INCREASE
  }
  const locked = FARE_ADJUSTMENT_KIND_DEFAULT_DIRECTION[kind]
  return locked === 'decrease'
    ? FareAdjustmentDirection.DECREASE
    : FareAdjustmentDirection.INCREASE
}

export const SOURCE_ORDER_RECEIVABLE_STATUS_LABELS: Record<string, string> = {
  [SourceOrderReceivableStatus.NOT_GENERATED]: '未生成',
  [SourceOrderReceivableStatus.PENDING]: '待收',
  [SourceOrderReceivableStatus.PARTIAL]: '部分收款',
  [SourceOrderReceivableStatus.COLLECTED]: '已收齐',
  [SourceOrderReceivableStatus.CLOSED]: '已关闭',
}

/** Operations-sheet path progress wording (#97 / #94). */
export const OPERATIONS_SHEET_RECEIVABLE_PROGRESS_LABELS: Record<string, string> = {
  [SourceOrderReceivableStatus.NOT_GENERATED]: '—',
  [SourceOrderReceivableStatus.PENDING]: '待收款',
  [SourceOrderReceivableStatus.PARTIAL]: '部分收款',
  [SourceOrderReceivableStatus.COLLECTED]: '已收清',
  [SourceOrderReceivableStatus.CLOSED]: '已关闭',
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
  [SegmentPayableStatus.CLOSED]: '已关闭',
}
