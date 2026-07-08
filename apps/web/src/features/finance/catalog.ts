import {
  CounterpartyType,
  PAYMENT_CHANNEL_LABELS,
  PAYMENT_CHANNEL_OPTIONS,
  PaymentScheduleStatus,
  TransactionDirection,
  VerificationStatus,
} from '@xiaotuanbao/shared'

export function catalogLabel(
  labels: Record<string, string>,
  value: string | null | undefined,
): string {
  if (!value) {
    return '—'
  }
  return labels[value] ?? value
}

export function formatCents(cents: number): string {
  return `¥${(cents / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export const PAYMENT_SCHEDULE_STATUS_OPTIONS = [
  { value: PaymentScheduleStatus.PENDING, label: '待结清' },
  { value: PaymentScheduleStatus.OVERDUE, label: '已逾期' },
  { value: PaymentScheduleStatus.SETTLED, label: '已结清' },
  { value: PaymentScheduleStatus.CANCELLED, label: '已关闭' },
] as const

export const PAYMENT_SCHEDULE_STATUS_LABELS = Object.fromEntries(
  PAYMENT_SCHEDULE_STATUS_OPTIONS.map((item) => [item.value, item.label]),
) as Record<PaymentScheduleStatus, string>

export const PAYMENT_SCHEDULE_STATUS_COLORS: Record<string, string> = {
  [PaymentScheduleStatus.PENDING]: 'processing',
  [PaymentScheduleStatus.OVERDUE]: 'error',
  [PaymentScheduleStatus.SETTLED]: 'success',
  [PaymentScheduleStatus.CANCELLED]: 'default',
}

export const TRANSACTION_DIRECTION_OPTIONS = [
  { value: TransactionDirection.INFLOW, label: '流入' },
  { value: TransactionDirection.OUTFLOW, label: '流出' },
] as const

export const TRANSACTION_DIRECTION_LABELS = Object.fromEntries(
  TRANSACTION_DIRECTION_OPTIONS.map((item) => [item.value, item.label]),
) as Record<TransactionDirection, string>

export const TRANSACTION_DIRECTION_COLORS: Record<string, string> = {
  [TransactionDirection.INFLOW]: 'green',
  [TransactionDirection.OUTFLOW]: 'orange',
}

export { PAYMENT_CHANNEL_OPTIONS, PAYMENT_CHANNEL_LABELS }

export const COUNTERPARTY_TYPE_OPTIONS = [
  { value: CounterpartyType.PARTNER, label: '合作伙伴' },
  { value: CounterpartyType.SUPPLIER, label: '供应商' },
  { value: CounterpartyType.GUEST, label: '客人' },
  { value: CounterpartyType.MANUAL, label: '手工录入' },
] as const

export const COUNTERPARTY_TYPE_LABELS = Object.fromEntries(
  COUNTERPARTY_TYPE_OPTIONS.map((item) => [item.value, item.label]),
) as Record<CounterpartyType, string>

export const VERIFICATION_STATUS_LABELS: Record<string, string> = {
  [VerificationStatus.NORMAL]: '正常',
  [VerificationStatus.CANCELLED]: '已撤销',
}

export const VERIFICATION_STATUS_COLORS: Record<string, string> = {
  [VerificationStatus.NORMAL]: 'success',
  [VerificationStatus.CANCELLED]: 'default',
}
