import { describe, expect, it } from 'vitest'
import {
  ITINERARY_SEGMENT_OUT_OF_RANGE,
  type OutOfRangeItinerarySegmentConflict,
} from '@xiaotuanbao/shared'
import { ApiError } from '@/lib/request'
import {
  formatOutOfRangeItinerarySegmentError,
  formatTourPeriodSavedMessage,
  readOutOfRangeItinerarySegmentConflict,
} from './itinerary-segment-out-of-range'

const conflict: OutOfRangeItinerarySegmentConflict = {
  code: ITINERARY_SEGMENT_OUT_OF_RANGE,
  periodStartDate: '2026-12-01',
  periodEndDate: '2026-12-01',
  segments: [
    { id: 'day-2', name: '第2天', startDate: '2026-12-02', endDate: '2026-12-02' },
  ],
}

describe('readOutOfRangeItinerarySegmentConflict', () => {
  it('reads the affected itinerary segments from a 409 ApiError', () => {
    expect(
      readOutOfRangeItinerarySegmentConflict(new ApiError('保存被拒绝', 409, conflict)),
    ).toEqual(conflict)
  })

  it('ignores other errors', () => {
    expect(readOutOfRangeItinerarySegmentConflict(new ApiError('保存失败', 400))).toBeNull()
    expect(readOutOfRangeItinerarySegmentConflict(new Error('保存被拒绝'))).toBeNull()
  })
})

describe('formatOutOfRangeItinerarySegmentError', () => {
  it('formats the same actionable summary as the API', () => {
    expect(
      formatOutOfRangeItinerarySegmentError(new ApiError('保存被拒绝', 409, conflict)),
    ).toBe(
      '保存被拒绝：存在超出新团期（2026-12-01～2026-12-01）的行程段，请先调整后再保存。第2天（2026-12-02）',
    )
  })
})

describe('formatTourPeriodSavedMessage', () => {
  it('does not ask the user to add days by hand after extending the tour period', () => {
    expect(formatTourPeriodSavedMessage(true)).toEqual({
      success: '发团信息已保存',
      info: '团期已更新。延长时已自动补齐未覆盖日期的一日一段；缩短时若有超界行程段会被拒绝。',
    })
    expect(formatTourPeriodSavedMessage(true).info).not.toMatch(/手工/)
  })

  it('keeps a simple success when dates did not change', () => {
    expect(formatTourPeriodSavedMessage(false)).toEqual({ success: '发团信息已保存' })
  })
})
