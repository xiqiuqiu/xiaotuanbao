import { SourceOrderReceivableStatus } from '@xiaotuanbao/shared'
import type { SourceOrderSummary } from '@/types/api'
import { sourceOrderRebateDisplayCents } from './source-order-rebate-display'

/** 客源结算条：对应当前筛选列表（与表尾合计同一批；与批量提交全团路径计数解耦）。 */
export interface SourceOrdersSettlementStripSummary {
  orderCount: number
  totalGuests: number
  netReceivableCents: number
  partnerCollectedCents: number
  guestCollectCents: number
  ungeneratedCents: number
  ungeneratedCount: number
}

/** 客源表尾数值合计：对应当前筛选列表。 */
export interface SourceOrdersTableTotals {
  guestCount: number
  grossReceivableCents: number
  fareAdjustmentNetCents: number
  discountCents: number
  netReceivableCents: number
  partnerCollectedCents: number
  guestCollectCents: number
  rebateDisplayCents: number
}

export interface SourceOrdersListGlance {
  stripSummary: SourceOrdersSettlementStripSummary
  tableTotals: SourceOrdersTableTotals
}

/** 列表 glance 共用的「尚未提交应收」谓词（单数口径，非路径数）。 */
export function isUngeneratedReceivable(order: SourceOrderSummary): boolean {
  return (
    order.receivableStatus === SourceOrderReceivableStatus.NOT_GENERATED ||
    order.hasIncompleteReceivablePaths
  )
}

const EMPTY_STRIP: SourceOrdersSettlementStripSummary = {
  orderCount: 0,
  totalGuests: 0,
  netReceivableCents: 0,
  partnerCollectedCents: 0,
  guestCollectCents: 0,
  ungeneratedCount: 0,
  ungeneratedCents: 0,
}

const EMPTY_TABLE: SourceOrdersTableTotals = {
  guestCount: 0,
  grossReceivableCents: 0,
  fareAdjustmentNetCents: 0,
  discountCents: 0,
  netReceivableCents: 0,
  partnerCollectedCents: 0,
  guestCollectCents: 0,
  rebateDisplayCents: 0,
}

/**
 * 客源列表 glance：一次遍历投影结算条与表尾合计。
 * Scope：调用方传入的当前筛选 items；不负责全团批量路径计数。
 */
export function buildSourceOrdersListGlance(
  orders: readonly SourceOrderSummary[],
): SourceOrdersListGlance {
  if (orders.length === 0) {
    return { stripSummary: EMPTY_STRIP, tableTotals: EMPTY_TABLE }
  }

  return orders.reduce<SourceOrdersListGlance>(
    (acc, order) => {
      const ungenerated = isUngeneratedReceivable(order)
      return {
        stripSummary: {
          orderCount: acc.stripSummary.orderCount + 1,
          totalGuests: acc.stripSummary.totalGuests + order.guestCount,
          netReceivableCents:
            acc.stripSummary.netReceivableCents + order.netReceivableCents,
          partnerCollectedCents:
            acc.stripSummary.partnerCollectedCents + order.partnerCollectedCents,
          guestCollectCents:
            acc.stripSummary.guestCollectCents + order.guestCollectCents,
          ungeneratedCount: acc.stripSummary.ungeneratedCount + (ungenerated ? 1 : 0),
          ungeneratedCents:
            acc.stripSummary.ungeneratedCents +
            (ungenerated ? order.netReceivableCents : 0),
        },
        tableTotals: {
          guestCount: acc.tableTotals.guestCount + order.guestCount,
          grossReceivableCents:
            acc.tableTotals.grossReceivableCents + order.grossReceivableCents,
          fareAdjustmentNetCents:
            acc.tableTotals.fareAdjustmentNetCents + order.fareAdjustmentNetCents,
          discountCents: acc.tableTotals.discountCents + order.discountCents,
          netReceivableCents:
            acc.tableTotals.netReceivableCents + order.netReceivableCents,
          partnerCollectedCents:
            acc.tableTotals.partnerCollectedCents + order.partnerCollectedCents,
          guestCollectCents:
            acc.tableTotals.guestCollectCents + order.guestCollectCents,
          rebateDisplayCents:
            acc.tableTotals.rebateDisplayCents + sourceOrderRebateDisplayCents(order),
        },
      }
    },
    { stripSummary: EMPTY_STRIP, tableTotals: EMPTY_TABLE },
  )
}
