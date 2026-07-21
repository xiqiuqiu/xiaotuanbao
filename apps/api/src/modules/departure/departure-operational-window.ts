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
}

function addDays(value: string, days: number): string {
  const date = parseDateOnly(value)
  date.setUTCDate(date.getUTCDate() + days)
  return formatDateOnly(date)
}

export function getDepartureOperationalDates(asOf: Date): DepartureOperationalDates {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(asOf)
  return {
    today,
    tomorrow: addDays(today, 1),
    nextSevenDaysEnd: addDays(today, 7),
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
