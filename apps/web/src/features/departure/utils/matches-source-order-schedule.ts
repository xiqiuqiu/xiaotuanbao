import {
  SOURCE_ORDER_RECEIVABLE_SOURCE_TYPES,
  type PaymentScheduleSummary,
} from '@xiaotuanbao/shared'

const SOURCE_ORDER_SCHEDULE_TYPES = new Set<string>(SOURCE_ORDER_RECEIVABLE_SOURCE_TYPES)

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
