import { SegmentPayableStatus } from '@xiaotuanbao/shared'
import type { SourceOrderSummary } from '@/types/api'

/** 列表展示：未落账用预计金额，已落账用应付金额。 */
export function sourceOrderRebateDisplayCents(order: SourceOrderSummary): number {
  return order.rebateStatus === SegmentPayableStatus.NOT_GENERATED
    ? order.estimatedRebateCents
    : order.rebateCents
}
