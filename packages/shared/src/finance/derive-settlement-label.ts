import { PaymentScheduleDirection } from '../enums/payment-schedule-direction.enum'
import { PaymentScheduleStatus } from '../enums/payment-schedule-status.enum'

export interface SettlementLabelResult {
  label: string
  isOverdue: boolean
}

export function deriveSettlementLabel(
  direction: PaymentScheduleDirection | string,
  amountCents: number,
  settledAmountCents: number,
  status: PaymentScheduleStatus | string,
): SettlementLabelResult {
  const isReceivable =
    direction === PaymentScheduleDirection.RECEIVABLE || direction === 'receivable'

  const isSettled =
    status === PaymentScheduleStatus.SETTLED || settledAmountCents >= amountCents

  if (isSettled) {
    return { label: isReceivable ? '已收清' : '已付清', isOverdue: false }
  }

  const isOverdue =
    isReceivable && status === PaymentScheduleStatus.OVERDUE

  if (settledAmountCents > 0) {
    return { label: isReceivable ? '部分收款' : '部分付款', isOverdue }
  }

  return { label: isReceivable ? '待收款' : '待付款', isOverdue }
}
