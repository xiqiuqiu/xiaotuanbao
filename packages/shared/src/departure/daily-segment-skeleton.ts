export interface DatedItinerarySegment {
  startDate: string | null
  endDate: string | null
}

export interface OutOfRangeItinerarySegment extends DatedItinerarySegment {
  id: string
  name: string
}

export const ITINERARY_SEGMENT_OUT_OF_RANGE = 'ITINERARY_SEGMENT_OUT_OF_RANGE' as const

export interface OutOfRangeItinerarySegmentConflict {
  code: typeof ITINERARY_SEGMENT_OUT_OF_RANGE
  periodStartDate: string
  periodEndDate: string
  segments: OutOfRangeItinerarySegment[]
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

function assertDateOnly(value: string): string {
  if (!DATE_ONLY.test(value)) {
    throw new Error(`日期必须为 YYYY-MM-DD，收到 ${value}`)
  }
  return value
}

function parseUtcMs(value: string): number {
  return Date.parse(`${assertDateOnly(value)}T00:00:00.000Z`)
}

function formatUtcDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

/** Inclusive calendar days from start to end as YYYY-MM-DD strings. */
export function listTourDays(startDate: string, endDate: string): string[] {
  const startMs = parseUtcMs(startDate)
  const endMs = parseUtcMs(endDate)
  if (endMs < startMs) {
    throw new Error('结束日期不能早于出团日期')
  }

  const days: string[] = []
  for (let ms = startMs; ms <= endMs; ms += 24 * 60 * 60 * 1000) {
    days.push(formatUtcDate(ms))
  }
  return days
}

function itinerarySegmentCoversDay(segment: DatedItinerarySegment, day: string): boolean {
  if (!segment.startDate || !segment.endDate) {
    return false
  }
  return segment.startDate <= day && day <= segment.endDate
}

/** Days in the tour period not covered by any dated itinerary segment. */
export function listUncoveredTourDays(
  startDate: string,
  endDate: string,
  segments: DatedItinerarySegment[],
): string[] {
  return listTourDays(startDate, endDate).filter(
    (day) => !segments.some((segment) => itinerarySegmentCoversDay(segment, day)),
  )
}

function isItinerarySegmentOutOfRange(
  segment: DatedItinerarySegment,
  periodStartDate: string,
  periodEndDate: string,
): boolean {
  if (!segment.startDate || !segment.endDate) {
    return false
  }
  return segment.startDate < periodStartDate || segment.endDate > periodEndDate
}

/** Dated itinerary segments that start before or end after the new tour period. */
export function listOutOfRangeItinerarySegments<T extends DatedItinerarySegment>(
  periodStartDate: string,
  periodEndDate: string,
  segments: T[],
): T[] {
  assertDateOnly(periodStartDate)
  assertDateOnly(periodEndDate)
  return segments.filter((segment) =>
    isItinerarySegmentOutOfRange(segment, periodStartDate, periodEndDate),
  )
}

function formatSegmentRange(segment: DatedItinerarySegment): string {
  if (!segment.startDate || !segment.endDate) {
    return '未定日期'
  }
  if (segment.startDate === segment.endDate) {
    return segment.startDate
  }
  return `${segment.startDate}～${segment.endDate}`
}

/** User-facing summary of itinerary segments blocking a shorter tour period. */
export function formatOutOfRangeItinerarySegmentSummary(
  conflict: OutOfRangeItinerarySegmentConflict,
): string {
  const period = `${conflict.periodStartDate}～${conflict.periodEndDate}`
  const details = conflict.segments
    .map((segment) => `${segment.name}（${formatSegmentRange(segment)}）`)
    .join('；')
  return `保存被拒绝：存在超出新团期（${period}）的行程段，请先调整后再保存。${details}`
}

export function buildOutOfRangeItinerarySegmentConflict(
  periodStartDate: string,
  periodEndDate: string,
  segments: OutOfRangeItinerarySegment[],
): OutOfRangeItinerarySegmentConflict {
  return {
    code: ITINERARY_SEGMENT_OUT_OF_RANGE,
    periodStartDate,
    periodEndDate,
    segments,
  }
}
