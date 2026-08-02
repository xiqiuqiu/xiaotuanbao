import dayjs from 'dayjs'
import type { ItinerarySegmentSummary } from '@/types/api'
import type { CreateItinerarySegmentDto, UpdateItinerarySegmentDto } from '@/types/api'

export interface SegmentFormValues {
  name: string
  startDate?: string
  endDate?: string
  notes?: string
  fullTicketCount: number
  halfTicketCount: number
  studentTicketCount: number
  freeTicketCount: number
}

export function segmentToFormValues(segment: ItinerarySegmentSummary): SegmentFormValues {
  return {
    name: segment.name,
    startDate: segment.startDate ?? undefined,
    endDate: segment.endDate ?? undefined,
    notes: segment.notes ?? undefined,
    fullTicketCount: segment.fullTicketCount,
    halfTicketCount: segment.halfTicketCount,
    studentTicketCount: segment.studentTicketCount,
    freeTicketCount: segment.freeTicketCount,
  }
}

export function createDefaultSegmentFormValues(): SegmentFormValues {
  return {
    name: '',
    startDate: undefined,
    endDate: undefined,
    fullTicketCount: 0,
    halfTicketCount: 0,
    studentTicketCount: 0,
    freeTicketCount: 0,
  }
}

export function formValuesToPayload(
  values: SegmentFormValues,
): CreateItinerarySegmentDto & UpdateItinerarySegmentDto {
  // UI exposes a single「日期」; one-day segments keep start === end.
  const date = values.startDate || null

  return {
    name: values.name.trim(),
    startDate: date,
    endDate: date,
    notes: values.notes?.trim() || undefined,
    fullTicketCount: values.fullTicketCount ?? 0,
    halfTicketCount: values.halfTicketCount ?? 0,
    studentTicketCount: values.studentTicketCount ?? 0,
    freeTicketCount: values.freeTicketCount ?? 0,
  }
}

export function formatSegmentDateRange(
  startDate: string | null | undefined,
  endDate: string | null | undefined,
): string | null {
  if (!startDate || !endDate) {
    return null
  }

  const start = dayjs(startDate)
  const end = dayjs(endDate)

  if (start.isSame(end, 'month')) {
    return `${start.format('M月D日')}–${end.format('D日')}`
  }

  return `${start.format('M月D日')}–${end.format('M月D日')}`
}
