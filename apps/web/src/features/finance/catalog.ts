import {
  CounterpartyType,
  PAYMENT_CHANNEL_LABELS,
  PAYMENT_CHANNEL_OPTIONS,
  PaymentScheduleCloseDisposition,
  PaymentScheduleStatus,
  TransactionDirection,
  TransactionWriteoffStatus,
  VerificationStatus,
} from '@xiaotuanbao/shared'

export function catalogLabel(
  labels: Record<string, string>,
  value: string | null | undefined,
): string {
  if (!value) {
    return '-'
  }
  return labels[value] ?? value
}

export function formatCents(cents: number): string {
  return `¥${(cents / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export const SETTLEMENT_LABEL_COLORS: Record<string, string> = {
  待收款: 'processing',
  部分收款: 'gold',
  已收清: 'success',
  待付款: 'processing',
  部分付款: 'gold',
  已付清: 'success',
  已关闭: 'default',
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

export const CLOSE_DISPOSITION_OPTIONS = [
  { value: PaymentScheduleCloseDisposition.EXTERNAL_OR_SPECIAL, label: '转外部或专项处理' },
  { value: PaymentScheduleCloseDisposition.BUSINESS_DISPUTE_STOP, label: '商务争议停止跟进' },
  { value: PaymentScheduleCloseDisposition.OTHER, label: '其他' },
] as const

export const CLOSE_DISPOSITION_LABELS = Object.fromEntries(
  CLOSE_DISPOSITION_OPTIONS.map((item) => [item.value, item.label]),
) as Record<PaymentScheduleCloseDisposition, string>

export const TRANSACTION_DIRECTION_OPTIONS = [
  { value: TransactionDirection.INFLOW, label: '收入' },
  { value: TransactionDirection.OUTFLOW, label: '支出' },
] as const

export const TRANSACTION_DIRECTION_LABELS = Object.fromEntries(
  TRANSACTION_DIRECTION_OPTIONS.map((item) => [item.value, item.label]),
) as Record<TransactionDirection, string>

export const TRANSACTION_DIRECTION_COLORS: Record<string, string> = {
  [TransactionDirection.INFLOW]: 'green',
  [TransactionDirection.OUTFLOW]: 'orange',
}

export const TRANSACTION_WRITEOFF_STATUS_OPTIONS = [
  { value: TransactionWriteoffStatus.NONE, label: '未核销' },
  { value: TransactionWriteoffStatus.PARTIAL, label: '部分核销' },
  { value: TransactionWriteoffStatus.DONE, label: '已核销' },
] as const

export const TRANSACTION_WRITEOFF_STATUS_LABELS = Object.fromEntries(
  TRANSACTION_WRITEOFF_STATUS_OPTIONS.map((item) => [item.value, item.label]),
) as Record<TransactionWriteoffStatus, string>

export const TRANSACTION_WRITEOFF_STATUS_COLORS: Record<string, string> = {
  [TransactionWriteoffStatus.NONE]: 'default',
  [TransactionWriteoffStatus.PARTIAL]: 'gold',
  [TransactionWriteoffStatus.DONE]: 'success',
}

export const TRANSACTION_STATUS_OPTIONS = [
  { value: 'normal', label: '正常' },
  { value: 'voided', label: '已作废' },
] as const

export const TRANSACTION_STATUS_LABELS = Object.fromEntries(
  TRANSACTION_STATUS_OPTIONS.map((item) => [item.value, item.label]),
) as Record<'normal' | 'voided', string>

export { PAYMENT_CHANNEL_OPTIONS, PAYMENT_CHANNEL_LABELS }

export const COUNTERPARTY_TYPE_OPTIONS = [
  { value: CounterpartyType.PARTNER, label: '合作伙伴' },
  { value: CounterpartyType.SUPPLIER, label: '供应商' },
  { value: CounterpartyType.GUEST, label: '游客代收' },
  { value: CounterpartyType.MANUAL, label: '手工录入' },
] as const

export const COUNTERPARTY_TYPE_LABELS = Object.fromEntries(
  COUNTERPARTY_TYPE_OPTIONS.map((item) => [item.value, item.label]),
) as Record<CounterpartyType, string>

export const VERIFICATION_DIRECTION_OPTIONS = [
  { value: 'receivable', label: '应收核销' },
  { value: 'payable', label: '应付核销' },
] as const

export const VERIFICATION_DIRECTION_LABELS: Record<string, string> = Object.fromEntries(
  VERIFICATION_DIRECTION_OPTIONS.map((item) => [item.value, item.label]),
)

export const VERIFICATION_DIRECTION_COLORS: Record<string, string> = {
  receivable: 'blue',
  payable: 'purple',
}

export const VERIFICATION_STATUS_OPTIONS = [
  { value: 'normal', label: '正常' },
  { value: 'cancelled', label: '已撤销' },
] as const

export const VERIFICATION_STATUS_LABELS: Record<string, string> = {
  [VerificationStatus.NORMAL]: '正常',
  [VerificationStatus.CANCELLED]: '已撤销',
}

export const VERIFICATION_STATUS_COLORS: Record<string, string> = {
  [VerificationStatus.NORMAL]: 'success',
  [VerificationStatus.CANCELLED]: 'default',
}
