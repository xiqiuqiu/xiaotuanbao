import type { Prisma } from '@prisma/client'

/** 工作台待付款 / 应付列表共用的开放未付筛选。 */
export const PAYABLE_BALANCE_OPEN_UNPAID = 'open_unpaid' as const

export type PayableBalanceFilter = typeof PAYABLE_BALANCE_OPEN_UNPAID

export const PAYABLE_BALANCE_FILTERS = [
  PAYABLE_BALANCE_OPEN_UNPAID,
] as const satisfies readonly PayableBalanceFilter[]

/**
 * 开放应付基础口径：未作废、未关闭。
 * 未付金额 > 0 由调用方在查询后结合核销汇总过滤。
 * 不含到期日 / 逾期窗口（ADR-0019）。
 */
export function buildOpenPayableBaseWhere(
  organizationId: string,
): Prisma.PaymentScheduleWhereInput {
  return {
    organizationId,
    direction: 'payable',
    voidedAt: null,
    cancelledAt: null,
  }
}

export function payableOpenUnpaidHref(): string {
  return `/finance/payable?payableBalance=${PAYABLE_BALANCE_OPEN_UNPAID}`
}

export function payableScheduleHref(scheduleNo: string): string {
  return `/finance/payable?scheduleNo=${encodeURIComponent(scheduleNo)}`
}
