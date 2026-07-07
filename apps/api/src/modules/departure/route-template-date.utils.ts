import { computeDayCount, formatDateOnly, parseDateOnly } from './departure-date.utils'

export interface SegmentDateRange {
  startDate: Date
  endDate: Date
  dayCount: number
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

export function allocateSegmentDates(
  departureStartDate: Date,
  segmentDayCounts: number[],
): SegmentDateRange[] {
  let cursor = parseDateOnly(formatDateOnly(departureStartDate))

  return segmentDayCounts.map((dayCount) => {
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
