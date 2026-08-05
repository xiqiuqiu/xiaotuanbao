import { PaymentScheduleSourceType, ResourceKind } from '@xiaotuanbao/shared'

/** B 款概览待办 + 构成补充（逻辑对齐原型 supplement.ts，#277）。 */
export type DepartureOverviewBSupplement = {
  guestList: {
    recorded: number
    planned: number
    missing: number
  }
  pendingReceivableCount: number
  pendingPayableCount: number
  unassignedSegmentCount: number
  overdueAccountCount: number
  resourceCostCents: number
  outsourceCostCents: number
  additionalIncomeGrossCents: number
  additionalIncomeExpenseCents: number
  customerTopUpCents: number
  customerRebateCents: number
}

export const EMPTY_OVERVIEW_B_SUPPLEMENT: DepartureOverviewBSupplement = {
  guestList: { recorded: 0, planned: 0, missing: 0 },
  pendingReceivableCount: 0,
  pendingPayableCount: 0,
  unassignedSegmentCount: 0,
  overdueAccountCount: 0,
  resourceCostCents: 0,
  outsourceCostCents: 0,
  additionalIncomeGrossCents: 0,
  additionalIncomeExpenseCents: 0,
  customerTopUpCents: 0,
  customerRebateCents: 0,
}

export type OverviewBSourceOrderInput = {
  guestCount: number
  recordedGuestCount: number
  hasPaymentSchedule: boolean
  netReceivableCents: number
}

export type OverviewBSegmentInput = {
  resourceCount: number
  payableGeneratedCount: number
  outsourceCount: number
  resourceAmountCents: number
}

export type OverviewBDepartureResourceInput = {
  resourceKind: string
  amountCents: number
  hasPaymentSchedule?: boolean
}

export type OverviewBScheduleInput = {
  unsettledAmountCents: number
  dueDate: string
  cancelledAt: string | null
  voidedAt: string | null
  sourceType?: string
}

export function deriveGuestListTodo(
  sourceOrders: Array<{ guestCount: number; recordedGuestCount: number }>,
) {
  const planned = sourceOrders.reduce((sum, order) => sum + order.guestCount, 0)
  const recorded = sourceOrders.reduce((sum, order) => sum + order.recordedGuestCount, 0)
  return {
    recorded,
    planned,
    missing: Math.max(planned - recorded, 0),
  }
}

export function countPendingReceivableSourceOrders(
  sourceOrders: Array<{ hasPaymentSchedule: boolean; netReceivableCents: number }>,
): number {
  return sourceOrders.filter(
    (order) => !order.hasPaymentSchedule && order.netReceivableCents > 0,
  ).length
}

export function countPendingPayableResources(input: {
  segments: Array<{ resourceCount: number; payableGeneratedCount: number }>
  departureResources: Array<{ hasPaymentSchedule: boolean; amountCents: number }>
}): number {
  const segmentPending = input.segments.reduce(
    (sum, segment) => sum + Math.max(segment.resourceCount - segment.payableGeneratedCount, 0),
    0,
  )
  const departurePending = input.departureResources.filter(
    (resource) => !resource.hasPaymentSchedule && resource.amountCents > 0,
  ).length
  return segmentPending + departurePending
}

export function countUnassignedSegments(
  segments: Array<{ resourceCount: number }>,
): number {
  return segments.filter((segment) => segment.resourceCount === 0).length
}

export function countOverdueSchedules(
  items: Array<{
    unsettledAmountCents: number
    dueDate: string
    cancelledAt: string | null
    voidedAt: string | null
  }>,
  today: string,
): number {
  return items.filter(
    (item) =>
      item.unsettledAmountCents > 0 &&
      item.dueDate < today &&
      item.cancelledAt == null &&
      item.voidedAt == null,
  ).length
}

export function splitResourceAndOutsourceCost(input: {
  segments: Array<{
    resourceCount: number
    outsourceCount: number
    resourceAmountCents: number
  }>
  departureResources: Array<{ resourceKind: string; amountCents: number }>
  segmentResourceRows?: Array<{ resourceKind: string; amountCents: number }>
}): { resourceCostCents: number; outsourceCostCents: number } {
  if (input.segmentResourceRows && input.segmentResourceRows.length > 0) {
    let resourceCostCents = 0
    let outsourceCostCents = 0
    for (const row of input.segmentResourceRows) {
      if (row.resourceKind === ResourceKind.OUTSOURCE) {
        outsourceCostCents += row.amountCents
      } else {
        resourceCostCents += row.amountCents
      }
    }
    for (const resource of input.departureResources) {
      if (resource.resourceKind === ResourceKind.OUTSOURCE) {
        outsourceCostCents += resource.amountCents
      } else {
        resourceCostCents += resource.amountCents
      }
    }
    return { resourceCostCents, outsourceCostCents }
  }

  const segmentTotal = input.segments.reduce((sum, segment) => sum + segment.resourceAmountCents, 0)
  const segmentOutsourceEstimate = input.segments.reduce((sum, segment) => {
    if (segment.resourceCount === 0) return sum
    const ratio = segment.outsourceCount / segment.resourceCount
    return sum + Math.round(segment.resourceAmountCents * ratio)
  }, 0)
  let departureResource = 0
  let departureOutsource = 0
  for (const resource of input.departureResources) {
    if (resource.resourceKind === ResourceKind.OUTSOURCE) {
      departureOutsource += resource.amountCents
    } else {
      departureResource += resource.amountCents
    }
  }
  return {
    resourceCostCents: segmentTotal - segmentOutsourceEstimate + departureResource,
    outsourceCostCents: segmentOutsourceEstimate + departureOutsource,
  }
}

export function deriveIncomeBreakdown(income: {
  amountCentsTotal?: number
  commissionCentsTotal?: number
} | undefined) {
  return {
    additionalIncomeGrossCents: income?.amountCentsTotal ?? 0,
    additionalIncomeExpenseCents: income?.commissionCentsTotal ?? 0,
  }
}

/** 客户补款：客源结算路径开放未结清；待返客户：返利未付。 */
export function deriveCollectionHints(input: {
  receivables: Array<{ sourceType: string; unsettledAmountCents: number }>
  rebateUnpaidCents: number
}): { customerTopUpCents: number; customerRebateCents: number } {
  const customerTopUpCents = input.receivables
    .filter(
      (item) =>
        item.sourceType === PaymentScheduleSourceType.SOURCE_ORDER_CUSTOMER_SETTLEMENT &&
        item.unsettledAmountCents > 0,
    )
    .reduce((sum, item) => sum + item.unsettledAmountCents, 0)

  return {
    customerTopUpCents,
    customerRebateCents: input.rebateUnpaidCents,
  }
}

export function buildDepartureOverviewBSupplement(input: {
  sourceOrders: OverviewBSourceOrderInput[]
  segments: OverviewBSegmentInput[]
  departureResources: OverviewBDepartureResourceInput[]
  receivables?: OverviewBScheduleInput[]
  payables?: OverviewBScheduleInput[]
  income?: { amountCentsTotal?: number; commissionCentsTotal?: number }
  rebateUnpaidCents: number
  segmentResourceRows?: Array<{ resourceKind: string; amountCents: number }>
  today: string
  /** Facade 聚合覆盖：逾期条数（ADR-0004 不暴露节点明细时使用）。 */
  overdueAccountCount?: number
  /** Facade 聚合覆盖：客户待补款。 */
  customerTopUpCents?: number
}): DepartureOverviewBSupplement {
  const incomeBreakdown = deriveIncomeBreakdown(input.income)
  const costSplit = splitResourceAndOutsourceCost({
    segments: input.segments,
    departureResources: input.departureResources,
    segmentResourceRows: input.segmentResourceRows,
  })
  const receivables = input.receivables ?? []
  const payables = input.payables ?? []
  const collectionHints =
    input.customerTopUpCents != null
      ? {
          customerTopUpCents: input.customerTopUpCents,
          customerRebateCents: input.rebateUnpaidCents,
        }
      : deriveCollectionHints({
          receivables: receivables.map((item) => ({
            sourceType: item.sourceType ?? '',
            unsettledAmountCents: item.unsettledAmountCents,
          })),
          rebateUnpaidCents: input.rebateUnpaidCents,
        })

  return {
    guestList: deriveGuestListTodo(input.sourceOrders),
    pendingReceivableCount: countPendingReceivableSourceOrders(input.sourceOrders),
    pendingPayableCount: countPendingPayableResources({
      segments: input.segments,
      departureResources: input.departureResources.map((resource) => ({
        hasPaymentSchedule: resource.hasPaymentSchedule ?? false,
        amountCents: resource.amountCents,
      })),
    }),
    unassignedSegmentCount: countUnassignedSegments(input.segments),
    overdueAccountCount:
      input.overdueAccountCount ??
      countOverdueSchedules(receivables, input.today) +
        countOverdueSchedules(payables, input.today),
    ...costSplit,
    ...incomeBreakdown,
    ...collectionHints,
  }
}
