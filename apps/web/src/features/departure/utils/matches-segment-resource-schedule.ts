import {
  PaymentScheduleSourceType,
  type PaymentScheduleSummary,
} from '@xiaotuanbao/shared'

/** Whether a payable schedule belongs to the given segment resource. */
export function matchesSegmentResourceSchedule(
  schedule: Pick<PaymentScheduleSummary, 'sourceType' | 'sourceId'>,
  segmentResourceId: string,
): boolean {
  return (
    schedule.sourceId === segmentResourceId &&
    schedule.sourceType === PaymentScheduleSourceType.SEGMENT_RESOURCE
  )
}
