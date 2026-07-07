import {
  DirectoryProfileStatus,
  SettlementCycle,
  SettlementMethod,
} from '@xiaotuanbao/shared'

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

export function catalogLabel(
  labels: Record<string, string>,
  value: string | null | undefined,
): string {
  if (!value) {
    return '—'
  }
  return labels[value] ?? value
}
