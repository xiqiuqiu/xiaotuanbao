import {
  formatOutOfRangeItinerarySegmentSummary,
  ITINERARY_SEGMENT_OUT_OF_RANGE,
  type OutOfRangeItinerarySegmentConflict,
} from '@xiaotuanbao/shared'
import { ApiError } from '@/lib/request'

function isOutOfRangeItinerarySegmentConflict(
  value: unknown,
): value is OutOfRangeItinerarySegmentConflict {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const candidate = value as Partial<OutOfRangeItinerarySegmentConflict>
  return (
    candidate.code === ITINERARY_SEGMENT_OUT_OF_RANGE &&
    typeof candidate.periodStartDate === 'string' &&
    typeof candidate.periodEndDate === 'string' &&
    Array.isArray(candidate.segments)
  )
}

export function readOutOfRangeItinerarySegmentConflict(
  error: unknown,
): OutOfRangeItinerarySegmentConflict | null {
  if (!(error instanceof ApiError) || error.code !== 409) {
    return null
  }
  return isOutOfRangeItinerarySegmentConflict(error.data) ? error.data : null
}

export function formatOutOfRangeItinerarySegmentError(error: unknown): string | null {
  const conflict = readOutOfRangeItinerarySegmentConflict(error)
  if (!conflict) {
    return null
  }
  return formatOutOfRangeItinerarySegmentSummary(conflict)
}

export function formatTourPeriodSavedMessage(datesChanged: boolean): {
  success: string
  info?: string
} {
  if (!datesChanged) {
    return { success: '发团信息已保存' }
  }
  return {
    success: '发团信息已保存',
    info: '团期已更新。延长时已自动补齐未覆盖日期的一日一段；缩短时若有超界行程段会被拒绝。',
  }
}
