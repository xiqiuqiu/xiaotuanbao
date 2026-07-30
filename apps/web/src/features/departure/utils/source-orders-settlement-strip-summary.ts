import { SourceOrderReceivableStatus } from '@xiaotuanbao/shared'
import type { SourceOrderSummary } from '@/types/api'

/** 客源管理结算汇总条：对应当前列表 items（与表尾合计同一批，与批量生成全团计数解耦）。 */
export interface SourceOrdersSettlementStripSummary {
  orderCount: number
  totalGuests: number
  netReceivableCents: number
  partnerCollectedCents: number
  guestCollectCents: number
  ungeneratedCents: number
  ungeneratedCount: number
}

function isUngeneratedReceivable(order: SourceOrderSummary): boolean {
  return (
    order.receivableStatus === SourceOrderReceivableStatus.NOT_GENERATED ||
    order.hasIncompleteReceivablePaths
  )
}

/** Client-side 结算应收 glance for the source-orders tab settlement strip. */
export function summarizeSourceOrdersSettlementStrip(
  orders: readonly SourceOrderSummary[],
): SourceOrdersSettlementStripSummary {
  return orders.reduce<SourceOrdersSettlementStripSummary>(
    (acc, order) => {
      const ungenerated = isUngeneratedReceivable(order)
      return {
        orderCount: acc.orderCount + 1,
        totalGuests: acc.totalGuests + order.guestCount,
        netReceivableCents: acc.netReceivableCents + order.netReceivableCents,
        partnerCollectedCents: acc.partnerCollectedCents + order.partnerCollectedCents,
        guestCollectCents: acc.guestCollectCents + order.guestCollectCents,
        ungeneratedCount: acc.ungeneratedCount + (ungenerated ? 1 : 0),
        ungeneratedCents:
          acc.ungeneratedCents + (ungenerated ? order.netReceivableCents : 0),
      }
    },
    {
      orderCount: 0,
      totalGuests: 0,
      netReceivableCents: 0,
      partnerCollectedCents: 0,
      guestCollectCents: 0,
      ungeneratedCount: 0,
      ungeneratedCents: 0,
    },
  )
}
