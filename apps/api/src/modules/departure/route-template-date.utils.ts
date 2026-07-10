import { computeDayCount, formatDateOnly, parseDateOnly } from './departure-date.utils'

export interface SegmentDateRange {
  startDate: Date
  endDate: Date
  dayCount: number
}

export type AllocatedSegmentDates =
  | SegmentDateRange
  | { startDate: null; endDate: null; dayCount: null }

function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

export function allocateSegmentDates(
  departureStartDate: Date,
  segmentDayCounts: Array<number | null>,
): AllocatedSegmentDates[] {
  let cursor = parseDateOnly(formatDateOnly(departureStartDate))

  return segmentDayCounts.map((dayCount) => {
    if (dayCount == null) {
      return { startDate: null, endDate: null, dayCount: null }
    }

    const startDate = cursor
    const endDate = addDays(startDate, dayCount - 1)
    cursor = addDays(endDate, 1)

    return {
      startDate,
      endDate,
      dayCount: computeDayCount(startDate, endDate),
    }
  })
}
