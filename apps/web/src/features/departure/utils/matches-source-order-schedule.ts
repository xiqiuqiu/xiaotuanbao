import {
  PaymentScheduleSourceType,
  type PaymentScheduleSummary,
} from '@xiaotuanbao/shared'

const SOURCE_ORDER_SCHEDULE_TYPES = new Set<string>([
  PaymentScheduleSourceType.SOURCE_ORDER_CUSTOMER_SETTLEMENT,
  PaymentScheduleSourceType.SOURCE_ORDER_GUEST_COLLECTION,
])

/** Whether a receivable schedule belongs to the given source order. */
export function matchesSourceOrderSchedule(
  schedule: Pick<PaymentScheduleSummary, 'sourceType' | 'sourceId'>,
  sourceOrderId: string,
): boolean {
  return (
    schedule.sourceId === sourceOrderId &&
    SOURCE_ORDER_SCHEDULE_TYPES.has(schedule.sourceType)
  )
}
