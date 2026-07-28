import { enumerateDateOnlyDays, segmentCoversDay } from './daily-segment-skeleton.utils'
import { parseDateOnly } from './departure-date.utils'

describe('daily-segment-skeleton.utils', () => {
  it('enumerates inclusive calendar days for a 10-day span', () => {
    expect(
      enumerateDateOnlyDays(parseDateOnly('2026-08-01'), parseDateOnly('2026-08-10')),
    ).toEqual([
      '2026-08-01',
      '2026-08-02',
      '2026-08-03',
      '2026-08-04',
      '2026-08-05',
      '2026-08-06',
      '2026-08-07',
      '2026-08-08',
      '2026-08-09',
      '2026-08-10',
    ])
  })

  it('treats a multi-day segment as covering each day in range', () => {
    const segment = {
      startDate: parseDateOnly('2026-10-01'),
      endDate: parseDateOnly('2026-10-02'),
    }
    expect(segmentCoversDay(segment, '2026-10-01')).toBe(true)
    expect(segmentCoversDay(segment, '2026-10-02')).toBe(true)
    expect(segmentCoversDay(segment, '2026-10-03')).toBe(false)
  })

  it('does not treat undated segments as covering any day', () => {
    expect(segmentCoversDay({ startDate: null, endDate: null }, '2026-10-01')).toBe(false)
  })
})
