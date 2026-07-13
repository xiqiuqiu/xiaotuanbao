import { SegmentPayableStatus } from '@xiaotuanbao/shared'

/**
 * Aggregate resource-level payable statuses into a segment / departure overview.
 *
 * Rules (same for segment and departure scope):
 * - no resources / all not_generated → not_generated
 * - all closed → closed
 * - settlement progress ignores closed resources (same as source-order / resource read model)
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

  if (statuses.every((status) => status === SegmentPayableStatus.CLOSED)) {
    return SegmentPayableStatus.CLOSED
  }

  const activeStatuses = statuses.filter(
    (status) => status !== SegmentPayableStatus.CLOSED,
  )

  if (activeStatuses.every((status) => status === SegmentPayableStatus.NOT_GENERATED)) {
    return SegmentPayableStatus.NOT_GENERATED
  }

  if (activeStatuses.every((status) => status === SegmentPayableStatus.PAID)) {
    return SegmentPayableStatus.PAID
  }

  if (activeStatuses.some((status) => status === SegmentPayableStatus.PARTIAL)) {
    return SegmentPayableStatus.PARTIAL
  }

  if (activeStatuses.every((status) => status === SegmentPayableStatus.PENDING)) {
    return SegmentPayableStatus.PENDING
  }

  return SegmentPayableStatus.PARTIAL
}

/** How many resources already have payables (anything other than not_generated). */
export function countPayableGenerated(
  statuses: readonly SegmentPayableStatus[],
): number {
  return statuses.filter(
    (status) => status !== SegmentPayableStatus.NOT_GENERATED,
  ).length
}
