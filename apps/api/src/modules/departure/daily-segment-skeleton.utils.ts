import { computeDayCount, formatDateOnly, parseDateOnly } from './departure-date.utils'

/** Inclusive calendar days from start to end as YYYY-MM-DD strings. */
export function enumerateDateOnlyDays(startDate: Date, endDate: Date): string[] {
  const dayCount = computeDayCount(startDate, endDate)
  const start = formatDateOnly(startDate)
  const days: string[] = []
  for (let offset = 0; offset < dayCount; offset += 1) {
    const ms = parseDateOnly(start).getTime() + offset * 24 * 60 * 60 * 1000
    days.push(formatDateOnly(new Date(ms)))
  }
  return days
}

/** True when a dated segment covers the calendar day (inclusive). */
export function segmentCoversDay(
  segment: { startDate: Date | null; endDate: Date | null },
  day: string,
): boolean {
  if (!segment.startDate || !segment.endDate) {
    return false
  }
  const start = formatDateOnly(segment.startDate)
  const end = formatDateOnly(segment.endDate)
  return start <= day && day <= end
}
