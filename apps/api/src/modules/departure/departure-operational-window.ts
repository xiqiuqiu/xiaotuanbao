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

export interface CalendarMonthBucket {
  /** `YYYY-MM` */
  month: string
  start: string
  end: string
}

/** 返回含 `asOf` 所在自然月在内的近 `count` 个 Asia/Shanghai 自然月（升序）。 */
export function listRecentCalendarMonths(asOf: Date, count: number): CalendarMonthBucket[] {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(asOf)
  const [year, month] = today.split('-').map(Number)
  const months: CalendarMonthBucket[] = []
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const cursor = new Date(Date.UTC(year, month - 1 - offset, 1))
    const monthKey = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`
    const start = `${monthKey}-01`
    const end = formatDateOnly(new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0)))
    months.push({ month: monthKey, start, end })
  }
  return months
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
