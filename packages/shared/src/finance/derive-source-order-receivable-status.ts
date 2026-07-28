import { PaymentScheduleStatus } from '../enums/payment-schedule-status.enum'
import { SourceOrderReceivableStatus } from '../enums/source-order-receivable-status.enum'

export interface SourceOrderReceivableScheduleProgress {
  amountCents: number
  settledAmountCents: number
  status: PaymentScheduleStatus
}

/**
 * Aggregate guest/customer receivable nodes into source-order list status.
 * PARTIAL when any node has settled amount but not every node is SETTLED —
 * including “定金已结清、尾款未收” multi-node progress (not only within-node partial).
 */
export function deriveSourceOrderReceivableStatus(
  scheduleStates: readonly SourceOrderReceivableScheduleProgress[],
): SourceOrderReceivableStatus {
  if (scheduleStates.length === 0) {
    return SourceOrderReceivableStatus.PENDING
  }

  const allCollected = scheduleStates.every(
    (item) => item.status === PaymentScheduleStatus.SETTLED,
  )
  if (allCollected) {
    return SourceOrderReceivableStatus.COLLECTED
  }

  const anySettled = scheduleStates.some((item) => item.settledAmountCents > 0)
  if (anySettled) {
    return SourceOrderReceivableStatus.PARTIAL
  }

  return SourceOrderReceivableStatus.PENDING
}
