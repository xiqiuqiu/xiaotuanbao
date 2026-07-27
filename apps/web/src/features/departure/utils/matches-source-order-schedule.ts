import {
  PaymentScheduleSourceType,
  type PaymentScheduleSummary,
} from '@xiaotuanbao/shared'

const SOURCE_ORDER_SCHEDULE_TYPES = new Set<string>([
  PaymentScheduleSourceType.SOURCE_ORDER_CUSTOMER_SETTLEMENT,
  PaymentScheduleSourceType.SOURCE_ORDER_GUEST_DEPOSIT_COLLECTION,
  PaymentScheduleSourceType.SOURCE_ORDER_GUEST_BALANCE_COLLECTION,
  PaymentScheduleSourceType.SOURCE_ORDER_REBATE,
])

/** Whether a source-order-linked schedule (receivable paths or rebate payable) belongs to the order. */
export function matchesSourceOrderSchedule(
  schedule: Pick<PaymentScheduleSummary, 'sourceType' | 'sourceId'>,
  sourceOrderId: string,
): boolean {
  return (
    schedule.sourceId === sourceOrderId &&
    SOURCE_ORDER_SCHEDULE_TYPES.has(schedule.sourceType)
  )
}
