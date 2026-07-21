import type { Prisma } from '@prisma/client'
import { addCalendarDays, getDepartureOperationalDates } from '../departure/departure-operational-window'
import { parseDateOnly } from '../departure/departure-date.utils'

/** 工作台应收跟进 / 账龄下钻与列表共用的稳定筛选窗口。 */
export type ReceivableFollowUpWindow =
  | 'overdue'
  | 'due_within_7_days'
  | 'aging_1_7'
  | 'aging_8_30'
  | 'aging_over_30'
  | 'follow_up'

export const RECEIVABLE_FOLLOW_UP_WINDOWS = [
  'overdue',
  'due_within_7_days',
  'aging_1_7',
  'aging_8_30',
  'aging_over_30',
  'follow_up',
] as const satisfies readonly ReceivableFollowUpWindow[]

export interface ReceivableFollowUpDates {
  today: string
  dueWithin7End: string
  aging1_7Start: string
  aging8_30Start: string
  agingOver30End: string
}

export function getReceivableFollowUpDates(asOf: Date): ReceivableFollowUpDates {
  const { today, nextSevenDaysEnd } = getDepartureOperationalDates(asOf)
  return {
    today,
    dueWithin7End: nextSevenDaysEnd,
    aging1_7Start: addCalendarDays(today, -7),
    aging8_30Start: addCalendarDays(today, -30),
    agingOver30End: addCalendarDays(today, -31),
  }
}

export function differenceInCalendarDays(later: string, earlier: string): number {
  return Math.round(
    (parseDateOnly(later).getTime() - parseDateOnly(earlier).getTime()) / 86_400_000,
  )
}

export type ReceivableAgingBucketKey = 'aging_1_7' | 'aging_8_30' | 'aging_over_30'

/** 逾期天数：到期日早于今天时为 today - dueDate；否则为 null。 */
export function overdueDays(dueDate: string, today: string): number | null {
  if (dueDate >= today) {
    return null
  }
  return differenceInCalendarDays(today, dueDate)
}

export function agingBucketForOverdueDays(
  days: number,
): ReceivableAgingBucketKey | null {
  if (days >= 1 && days <= 7) {
    return 'aging_1_7'
  }
  if (days >= 8 && days <= 30) {
    return 'aging_8_30'
  }
  if (days >= 31) {
    return 'aging_over_30'
  }
  return null
}

export function receivableFollowUpHref(window: ReceivableFollowUpWindow): string {
  return `/finance/receivable?receivableFollowUp=${window}`
}

/**
 * 开放应收基础口径：未作废、未关闭。
 * 未结金额 > 0 由调用方在查询后结合核销汇总过滤（与列表 unsettledAmountCents 一致）。
 */
export function buildOpenReceivableBaseWhere(
  organizationId: string,
): Prisma.PaymentScheduleWhereInput {
  return {
    organizationId,
    direction: 'receivable',
    voidedAt: null,
    cancelledAt: null,
  }
}

export function buildReceivableFollowUpDueDateWhere(
  window: ReceivableFollowUpWindow,
  dates: ReceivableFollowUpDates,
): Prisma.PaymentScheduleWhereInput {
  const today = parseDateOnly(dates.today)
  const dueWithin7End = parseDateOnly(dates.dueWithin7End)
  const aging1_7Start = parseDateOnly(dates.aging1_7Start)
  const aging8_30Start = parseDateOnly(dates.aging8_30Start)
  const agingOver30End = parseDateOnly(dates.agingOver30End)
  const yesterday = parseDateOnly(addCalendarDays(dates.today, -1))

  switch (window) {
    case 'overdue':
      return { dueDate: { lt: today } }
    case 'due_within_7_days':
      return { dueDate: { gte: today, lte: dueWithin7End } }
    case 'aging_1_7':
      return { dueDate: { gte: aging1_7Start, lte: yesterday } }
    case 'aging_8_30':
      return { dueDate: { gte: aging8_30Start, lte: parseDateOnly(addCalendarDays(dates.today, -8)) } }
    case 'aging_over_30':
      return { dueDate: { lte: agingOver30End } }
    case 'follow_up':
      return { dueDate: { lte: dueWithin7End } }
    default: {
      const _exhaustive: never = window
      return _exhaustive
    }
  }
}
