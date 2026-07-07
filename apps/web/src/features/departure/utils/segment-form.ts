import dayjs from 'dayjs'
import type { ItinerarySegmentSummary } from '@/types/api'
import type { CreateItinerarySegmentDto } from '@/types/api'
import { computeDayCount } from './departure-wizard-form'

export interface SegmentFormValues {
  name: string
  startDate: string
  endDate: string
  dayCount: number
  destination: string
  applicableGuestCount: number
  notes?: string
}

export function segmentToFormValues(segment: ItinerarySegmentSummary): SegmentFormValues {
  return {
    name: segment.name,
    startDate: segment.startDate,
    endDate: segment.endDate,
    dayCount: segment.dayCount,
    destination: segment.destination ?? '',
    applicableGuestCount: segment.applicableGuestCount,
    notes: segment.notes ?? undefined,
  }
}

export function createDefaultSegmentFormValues(
  departureStartDate: string,
  departureEndDate: string,
  defaultGuestCount: number,
): SegmentFormValues {
  return {
    name: '',
    startDate: departureStartDate,
    endDate: departureEndDate,
    dayCount: computeDayCount(departureStartDate, departureEndDate),
    destination: '',
    applicableGuestCount: defaultGuestCount > 0 ? defaultGuestCount : 1,
  }
}

export function formValuesToPayload(values: SegmentFormValues): CreateItinerarySegmentDto {
  return {
    name: values.name.trim(),
    startDate: values.startDate,
    endDate: values.endDate,
    destination: values.destination.trim(),
    applicableGuestCount: values.applicableGuestCount,
    notes: values.notes?.trim() || undefined,
  }
}

export function formatSegmentDateRange(startDate: string, endDate: string): string {
  const start = dayjs(startDate)
  const end = dayjs(endDate)

  if (start.isSame(end, 'month')) {
    return `${start.format('M月D日')}–${end.format('D日')}`
  }

  return `${start.format('M月D日')}–${end.format('M月D日')}`
}

export function formatResourceOverview(segment: ItinerarySegmentSummary): string {
  const parts = [`资源${segment.resourceCount}项`]

  if (segment.outsourceCount > 0) {
    parts.push(`拼出${segment.outsourceCount}条`)
  }

  if (segment.resourceAmountCents > 0) {
    parts.push(`¥${(segment.resourceAmountCents / 100).toLocaleString('zh-CN')}`)
  }

  return parts.join('｜')
}
