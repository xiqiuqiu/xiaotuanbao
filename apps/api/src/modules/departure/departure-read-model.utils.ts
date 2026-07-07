import type { DepartureCompletionTags } from '@xiaotuanbao/shared'
import { PaymentScheduleDirection } from '@prisma/client'

export interface ScheduleSnapshot {
  direction: PaymentScheduleDirection
  amountCents: number
  cancelledAt: Date | null
}

export interface SourceOrderAggregate {
  count: number
  totalGuests: number
  grossReceivableCents: number
  discountCents: number
  netReceivableCents: number
}

export interface DepartureReadModelAggregate {
  totalGuests: number
  sourceOrderCount: number
  segmentCount: number
  resourceCount: number
  grossReceivableCents: number
  discountCents: number
  netReceivableCents: number
  payableCents: number
  estimatedMarginCents: number
  collectedCents: number
  uncollectedCents: number
  paidCents: number
  unpaidCents: number
  completionTags: DepartureCompletionTags
  isFinanciallySettled: boolean
}

export const EMPTY_SOURCE_ORDER_AGGREGATE: SourceOrderAggregate = {
  count: 0,
  totalGuests: 0,
  grossReceivableCents: 0,
  discountCents: 0,
  netReceivableCents: 0,
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

  const allClosed = receivable.every((schedule) => {
    const settled = settledByScheduleId.get(schedule.id) ?? 0
    return isScheduleClosed(schedule, settled)
  })

  return allClosed ? '已收齐' : '应收已生成'
}

export function derivePayableTagFromSchedules(
  schedules: ScheduleWithId[],
  settledByScheduleId: Map<string, number>,
): string {
  const payable = schedules.filter((s) => s.direction === PaymentScheduleDirection.payable)
  if (payable.length === 0) {
    return '应付未生成'
  }

  const allClosed = payable.every((schedule) => {
    const settled = settledByScheduleId.get(schedule.id) ?? 0
    return isScheduleClosed(schedule, settled)
  })

  return allClosed ? '已付清' : '应付已生成'
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
  'collectedCents' | 'uncollectedCents' | 'paidCents' | 'unpaidCents'
> {
  let collectedCents = 0
  let uncollectedCents = 0
  let paidCents = 0
  let unpaidCents = 0

  for (const schedule of schedules) {
    const settled = settledByScheduleId.get(schedule.id) ?? 0
    const remaining = schedule.cancelledAt != null ? 0 : Math.max(schedule.amountCents - settled, 0)

    if (schedule.direction === PaymentScheduleDirection.receivable) {
      collectedCents += settled
      uncollectedCents += remaining
    } else {
      paidCents += settled
      unpaidCents += remaining
    }
  }

  return { collectedCents, uncollectedCents, paidCents, unpaidCents }
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
}): DepartureReadModelAggregate {
  const { sourceOrders, segmentCount, resourceCount, payableCents, schedules, settledByScheduleId } =
    input

  const financial = computeFinancialAmounts(schedules, settledByScheduleId)
  const estimatedMarginCents = sourceOrders.netReceivableCents - payableCents

  return {
    totalGuests: sourceOrders.totalGuests,
    sourceOrderCount: sourceOrders.count,
    segmentCount,
    resourceCount,
    grossReceivableCents: sourceOrders.grossReceivableCents,
    discountCents: sourceOrders.discountCents,
    netReceivableCents: sourceOrders.netReceivableCents,
    payableCents,
    estimatedMarginCents,
    ...financial,
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
  })
}
