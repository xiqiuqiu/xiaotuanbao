import { DepartureStatus, type Prisma } from '@prisma/client'
import { formatDateOnly, parseDateOnly } from './departure-date.utils'

export type DepartureOperationalWindow =
  | 'in_progress'
  | 'next_7_days'
  | 'current_and_next_7_days'

export interface DepartureOperationalDates {
  today: string
  tomorrow: string
  nextSevenDaysEnd: string
  /** 今天加 14 天（含），与「明天」组成未来 14 个自然日。 */
  nextFourteenDaysEnd: string
}

export function addCalendarDays(value: string, days: number): string {
  const date = parseDateOnly(value)
  date.setUTCDate(date.getUTCDate() + days)
  return formatDateOnly(date)
}

export function listInclusiveDateRange(from: string, to: string): string[] {
  const dates: string[] = []
  let current = from
  while (current <= to) {
    dates.push(current)
    current = addCalendarDays(current, 1)
  }
  return dates
}

export function getDepartureOperationalDates(asOf: Date): DepartureOperationalDates {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(asOf)
  return {
    today,
    tomorrow: addCalendarDays(today, 1),
    nextSevenDaysEnd: addCalendarDays(today, 7),
    nextFourteenDaysEnd: addCalendarDays(today, 14),
  }
}

export function buildDepartureOperationalWindowWhere(
  operationalWindow: DepartureOperationalWindow,
  dates: DepartureOperationalDates,
): Prisma.DepartureWhereInput {
  const inProgress = {
    startDate: { lte: parseDateOnly(dates.today) },
    endDate: { gte: parseDateOnly(dates.today) },
  }
  const nextSevenDays = {
    startDate: {
      gte: parseDateOnly(dates.tomorrow),
      lte: parseDateOnly(dates.nextSevenDaysEnd),
    },
  }

  return {
    status: { not: DepartureStatus.closed },
    ...(operationalWindow === 'in_progress'
      ? inProgress
      : operationalWindow === 'next_7_days'
        ? nextSevenDays
        : { OR: [inProgress, nextSevenDays] }),
  }
}
