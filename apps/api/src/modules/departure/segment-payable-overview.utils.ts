import { SegmentPayableStatus } from '@xiaotuanbao/shared'

/**
 * Aggregate resource-level payable statuses into a segment / departure overview.
 *
 * Rules (same for segment and departure scope):
 * - no resources / all not_generated → not_generated
 * - all paid → paid
 * - any partial, or mixed unpaid states → partial
 * - otherwise all generated and pending → pending
 */
export function aggregatePayableOverview(
  statuses: readonly SegmentPayableStatus[],
): SegmentPayableStatus {
  if (statuses.length === 0) {
    return SegmentPayableStatus.NOT_GENERATED
  }

  if (statuses.every((status) => status === SegmentPayableStatus.NOT_GENERATED)) {
    return SegmentPayableStatus.NOT_GENERATED
  }

  if (statuses.every((status) => status === SegmentPayableStatus.PAID)) {
    return SegmentPayableStatus.PAID
  }

  if (statuses.some((status) => status === SegmentPayableStatus.PARTIAL)) {
    return SegmentPayableStatus.PARTIAL
  }

  if (statuses.every((status) => status === SegmentPayableStatus.PENDING)) {
    return SegmentPayableStatus.PENDING
  }

  return SegmentPayableStatus.PARTIAL
}
