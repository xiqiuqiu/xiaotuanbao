import {
  isResourcePayableSourceType,
  type PaymentScheduleSummary,
} from '@xiaotuanbao/shared'

/**
 * Whether a payable schedule belongs to the given resource (段资源 ∪ 发团级资源).
 * Search param still named highlightSegmentResourceId for historical links.
 */
export function matchesSegmentResourceSchedule(
  schedule: Pick<PaymentScheduleSummary, 'sourceType' | 'sourceId'>,
  resourceId: string,
): boolean {
  return (
    schedule.sourceId === resourceId && isResourcePayableSourceType(schedule.sourceType)
  )
}
