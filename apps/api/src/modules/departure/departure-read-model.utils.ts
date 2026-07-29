import type { DepartureCompletionTags, DepartureOverviewStats } from '@xiaotuanbao/shared'
import { PaymentScheduleDirection, TransactionDirection } from '@prisma/client'
import {
  emptyDepartureFinanceSnapshot,
  type DepartureFinanceSnapshot,
} from '../finance/departure-finance-facade.service'
import type { DepartureOverviewCollectionStats } from './departure-overview-collection-stats'

export interface ScheduleSnapshot {
  direction: PaymentScheduleDirection
  amountCents: number
  cancelledAt: Date | null
}

export interface SourceOrderAggregate {
  count: number
  totalGuests: number
  grossReceivableCents: number
  fareAdjustmentNetCents: number
  discountCents: number
  netReceivableCents: number
}

export interface UnverifiedCashAggregate {
  unverifiedIncomeCents: number
  unverifiedExpenseCents: number
}

export interface TransactionCashSnapshot {
  direction: TransactionDirection
  amountCents: number
  allocatedAmountCents: number
  voidedAt: Date | null
}

export interface DepartureReadModelAggregate {
  totalGuests: number
  sourceOrderCount: number
  segmentCount: number
  resourceCount: number
  grossReceivableCents: number
  fareAdjustmentNetCents: number
  discountCents: number
  netReceivableCents: number
  payableCents: number
  estimatedMarginCents: number
  verifiedReceivableCents: number
  openUnsettledReceivableCents: number
  verifiedPayableCents: number
  openUnsettledPayableCents: number
  unverifiedIncomeCents: number
  unverifiedExpenseCents: number
  overviewStats: DepartureOverviewStats
  completionTags: DepartureCompletionTags
  isFinanciallySettled: boolean
}

export const EMPTY_SOURCE_ORDER_AGGREGATE: SourceOrderAggregate = {
  count: 0,
  totalGuests: 0,
  grossReceivableCents: 0,
  fareAdjustmentNetCents: 0,
  discountCents: 0,
  netReceivableCents: 0,
}

export const EMPTY_UNVERIFIED_CASH: UnverifiedCashAggregate = {
  unverifiedIncomeCents: 0,
  unverifiedExpenseCents: 0,
}

export interface DepartureOverviewSourceFacts {
  sourceReceivableUngeneratedCents: number
  generatedResourceAgreedCents: number
  /** 增收净收益：各条公司增收合计 */
  additionalIncomeNetCents: number
  collectionStats: DepartureOverviewCollectionStats
}

export const EMPTY_OVERVIEW_COLLECTION_STATS: DepartureOverviewCollectionStats = {
  settlementCollectionReceivedCents: 0,
  settlementCollectionReceivableCents: 0,
  guestCollectionReceivedCents: 0,
  guestCollectionAgreedCents: 0,
  estimatedRebateCents: 0,
}

function buildDepartureOverviewStats(input: {
  netReceivableCents: number
  estimatedPayableCents: number
  finance: DepartureFinanceSnapshot
  sourceFacts: DepartureOverviewSourceFacts
}): DepartureOverviewStats {
  const { finance } = input
  const ungeneratedPayableCents =
    input.estimatedPayableCents - input.sourceFacts.generatedResourceAgreedCents
  const resourcePayableDifferenceCents =
    finance.resourcePayableCents - input.sourceFacts.generatedResourceAgreedCents
  const confirmedMarginCents = input.netReceivableCents - finance.confirmedPayableCents
  const cashNetInflowCents =
    finance.incomeTransactionCents - finance.expenseTransactionCents
  const collection = input.sourceFacts.collectionStats

  const stats: DepartureOverviewStats = {
    receivedCents: finance.sourceReceivableReceivedCents,
    openUnreceivedCents: finance.sourceReceivableOpenUnreceivedCents,
    closedUnreceivedCents: finance.sourceReceivableClosedUnreceivedCents,
    ungeneratedReceivableCents: input.sourceFacts.sourceReceivableUngeneratedCents,
    otherReceivableCents: finance.otherReceivableCents,
    additionalIncomeNetCents: input.sourceFacts.additionalIncomeNetCents,
    settlementCollectionReceivedCents: collection.settlementCollectionReceivedCents,
    settlementCollectionReceivableCents: collection.settlementCollectionReceivableCents,
    guestCollectionReceivedCents: collection.guestCollectionReceivedCents,
    guestCollectionAgreedCents: collection.guestCollectionAgreedCents,
    estimatedRebateCents: collection.estimatedRebateCents,
    // 已确认/已付/未付以 Finance snapshot 为准（与全局应付同口径）。
    confirmedRebateCents: finance.confirmedRebateCents,
    rebatePaidCents: finance.rebatePaidCents,
    rebateUnpaidCents: finance.rebateUnpaidCents,
    confirmedPayableCents: finance.confirmedPayableCents,
    paidCents: finance.paidCents,
    resourcePaidCents: finance.resourcePaidCents,
    openUnpaidCents: finance.openUnpaidCents,
    closedUnpaidCents: finance.closedUnpaidCents,
    ungeneratedPayableCents,
    otherPayableCents: finance.otherPayableCents,
    resourcePayableDifferenceCents,
    confirmedMarginCents,
    incomeTransactionCents: finance.incomeTransactionCents,
    expenseTransactionCents: finance.expenseTransactionCents,
    cashNetInflowCents,
    unverifiedIncomeCents: finance.unverifiedIncomeCents,
    unverifiedExpenseCents: finance.unverifiedExpenseCents,
    verifiedFromExternalCents: finance.verifiedFromExternalCents,
    verifiedToOtherDeparturesCents: finance.verifiedToOtherDeparturesCents,
    anomalies: [],
  }

  // 代收溢价不计入结算应收守恒：从组成合计中扣除各单 max(0, G约定−S)。
  const receivableActualCents =
    stats.receivedCents +
    stats.openUnreceivedCents +
    stats.closedUnreceivedCents +
    stats.ungeneratedReceivableCents -
    collection.estimatedRebateCents
  const receivableDifferenceCents = receivableActualCents - input.netReceivableCents
  if (receivableDifferenceCents !== 0) {
    stats.anomalies.push({
      code: 'receivable_balance',
      expectedCents: input.netReceivableCents,
      actualCents: receivableActualCents,
      differenceCents: receivableDifferenceCents,
    })
  }

  return stats
}

export function isScheduleClosed(schedule: ScheduleSnapshot, settledAmountCents: number): boolean {
  if (schedule.cancelledAt != null) {
    return true
  }
  return settledAmountCents >= schedule.amountCents
}

export function deriveSourceOrderTag(count: number): string {
  return count === 0 ? '客源未录入' : `客源${count}单`
}

export function deriveSegmentTag(count: number): string {
  return count === 0 ? '行程未录入' : `行程${count}段`
}

export function deriveResourceTag(count: number): string {
  return count === 0 ? '资源未安排' : `资源${count}项`
}

export interface ScheduleWithId extends ScheduleSnapshot {
  id: string
}

export function deriveReceivableTagFromSchedules(
  schedules: ScheduleWithId[],
  settledByScheduleId: Map<string, number>,
): string {
  const receivable = schedules.filter((s) => s.direction === PaymentScheduleDirection.receivable)
  if (receivable.length === 0) {
    return '应收未生成'
  }

  const allSettled = receivable.every((schedule) => {
    const settled = settledByScheduleId.get(schedule.id) ?? 0
    return settled >= schedule.amountCents
  })

  return allSettled ? '已收齐' : '应收已生成'
}

export function derivePayableTagFromSchedules(
  schedules: ScheduleWithId[],
  settledByScheduleId: Map<string, number>,
): string {
  const payable = schedules.filter((s) => s.direction === PaymentScheduleDirection.payable)
  if (payable.length === 0) {
    return '应付未生成'
  }

  const allSettled = payable.every((schedule) => {
    const settled = settledByScheduleId.get(schedule.id) ?? 0
    return settled >= schedule.amountCents
  })

  return allSettled ? '已付清' : '应付已生成'
}

export function deriveCompletionTags(input: {
  sourceOrderCount: number
  segmentCount: number
  resourceCount: number
  schedules: ScheduleWithId[]
  settledByScheduleId: Map<string, number>
}): DepartureCompletionTags {
  return {
    sourceOrders: deriveSourceOrderTag(input.sourceOrderCount),
    segments: deriveSegmentTag(input.segmentCount),
    resources: deriveResourceTag(input.resourceCount),
    receivables: deriveReceivableTagFromSchedules(input.schedules, input.settledByScheduleId),
    payables: derivePayableTagFromSchedules(input.schedules, input.settledByScheduleId),
  }
}

export function computeFinancialAmounts(
  schedules: ScheduleWithId[],
  settledByScheduleId: Map<string, number>,
): Pick<
  DepartureReadModelAggregate,
  | 'verifiedReceivableCents'
  | 'openUnsettledReceivableCents'
  | 'verifiedPayableCents'
  | 'openUnsettledPayableCents'
> {
  let verifiedReceivableCents = 0
  let openUnsettledReceivableCents = 0
  let verifiedPayableCents = 0
  let openUnsettledPayableCents = 0

  for (const schedule of schedules) {
    const settled = settledByScheduleId.get(schedule.id) ?? 0
    // Closed nodes keep remaining on the node itself, but open summary excludes it.
    const openRemaining =
      schedule.cancelledAt != null ? 0 : Math.max(schedule.amountCents - settled, 0)

    if (schedule.direction === PaymentScheduleDirection.receivable) {
      verifiedReceivableCents += settled
      openUnsettledReceivableCents += openRemaining
    } else {
      verifiedPayableCents += settled
      openUnsettledPayableCents += openRemaining
    }
  }

  return {
    verifiedReceivableCents,
    openUnsettledReceivableCents,
    verifiedPayableCents,
    openUnsettledPayableCents,
  }
}

export function aggregateUnverifiedCashAmounts(
  transactions: TransactionCashSnapshot[],
): UnverifiedCashAggregate {
  let unverifiedIncomeCents = 0
  let unverifiedExpenseCents = 0

  for (const transaction of transactions) {
    if (transaction.voidedAt != null) {
      continue
    }
    const unallocated = Math.max(transaction.amountCents - transaction.allocatedAmountCents, 0)
    if (unallocated <= 0) {
      continue
    }
    if (transaction.direction === TransactionDirection.inflow) {
      unverifiedIncomeCents += unallocated
    } else {
      unverifiedExpenseCents += unallocated
    }
  }

  return { unverifiedIncomeCents, unverifiedExpenseCents }
}

export function deriveIsFinanciallySettled(
  schedules: ScheduleWithId[],
  settledByScheduleId: Map<string, number>,
): boolean {
  if (schedules.length === 0) {
    return false
  }

  return schedules.every((schedule) => {
    const settled = settledByScheduleId.get(schedule.id) ?? 0
    return isScheduleClosed(schedule, settled)
  })
}

export function buildDepartureReadModelAggregate(input: {
  sourceOrders: SourceOrderAggregate
  segmentCount: number
  resourceCount: number
  payableCents: number
  schedules: ScheduleWithId[]
  settledByScheduleId: Map<string, number>
  unverifiedCash?: UnverifiedCashAggregate
  financeSnapshot?: DepartureFinanceSnapshot
  overviewSourceFacts?: DepartureOverviewSourceFacts
}): DepartureReadModelAggregate {
  const {
    sourceOrders,
    segmentCount,
    resourceCount,
    payableCents,
    schedules,
    settledByScheduleId,
    unverifiedCash = EMPTY_UNVERIFIED_CASH,
  } = input

  const financial = computeFinancialAmounts(schedules, settledByScheduleId)
  const estimatedMarginCents = sourceOrders.netReceivableCents - payableCents
  const financeSnapshot = input.financeSnapshot ?? emptyDepartureFinanceSnapshot()
  const overviewSourceFacts = input.overviewSourceFacts ?? {
    sourceReceivableUngeneratedCents: sourceOrders.netReceivableCents,
    generatedResourceAgreedCents: 0,
    additionalIncomeNetCents: 0,
    collectionStats: {
      ...EMPTY_OVERVIEW_COLLECTION_STATS,
      settlementCollectionReceivableCents: sourceOrders.netReceivableCents,
    },
  }

  return {
    totalGuests: sourceOrders.totalGuests,
    sourceOrderCount: sourceOrders.count,
    segmentCount,
    resourceCount,
    grossReceivableCents: sourceOrders.grossReceivableCents,
    fareAdjustmentNetCents: sourceOrders.fareAdjustmentNetCents,
    discountCents: sourceOrders.discountCents,
    netReceivableCents: sourceOrders.netReceivableCents,
    payableCents,
    estimatedMarginCents,
    ...financial,
    unverifiedIncomeCents: unverifiedCash.unverifiedIncomeCents,
    unverifiedExpenseCents: unverifiedCash.unverifiedExpenseCents,
    overviewStats: buildDepartureOverviewStats({
      netReceivableCents: sourceOrders.netReceivableCents,
      estimatedPayableCents: payableCents,
      finance: financeSnapshot,
      sourceFacts: overviewSourceFacts,
    }),
    completionTags: deriveCompletionTags({
      sourceOrderCount: sourceOrders.count,
      segmentCount,
      resourceCount,
      schedules,
      settledByScheduleId,
    }),
    isFinanciallySettled: deriveIsFinanciallySettled(schedules, settledByScheduleId),
  }
}

export function emptyDepartureReadModelAggregate(): DepartureReadModelAggregate {
  return buildDepartureReadModelAggregate({
    sourceOrders: EMPTY_SOURCE_ORDER_AGGREGATE,
    segmentCount: 0,
    resourceCount: 0,
    payableCents: 0,
    schedules: [],
    settledByScheduleId: new Map(),
    unverifiedCash: EMPTY_UNVERIFIED_CASH,
  })
}
