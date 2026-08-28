import { listTourDays, listUncoveredTourDays } from '@xiaotuanbao/shared'
import { formatDateOnly } from './departure-date.utils'

function toDateOnly(value: Date | null): string | null {
  return value ? formatDateOnly(value) : null
}

/** Inclusive calendar days from start to end as YYYY-MM-DD strings. */
export function enumerateDateOnlyDays(startDate: Date, endDate: Date): string[] {
  return listTourDays(formatDateOnly(startDate), formatDateOnly(endDate))
}

/** True when a dated segment covers the calendar day (inclusive). */
export function segmentCoversDay(
  segment: { startDate: Date | null; endDate: Date | null },
  day: string,
): boolean {
  const start = toDateOnly(segment.startDate)
  const end = toDateOnly(segment.endDate)
  if (!start || !end) {
    return false
  }
  return start <= day && day <= end
}

export function uncoveredTourDaysForSegments(
  startDate: Date,
  endDate: Date,
  segments: Array<{ startDate: Date | null; endDate: Date | null }>,
): string[] {
  return listUncoveredTourDays(
    formatDateOnly(startDate),
    formatDateOnly(endDate),
    segments.map((segment) => ({
      startDate: toDateOnly(segment.startDate),
      endDate: toDateOnly(segment.endDate),
    })),
  )
}
