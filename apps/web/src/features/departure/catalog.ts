import { DepartureStatus } from '@xiaotuanbao/shared'

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
