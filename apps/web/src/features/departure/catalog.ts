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
