import { parseDateOnly } from './departure-date.utils'
import { allocateSegmentDates } from './route-template-date.utils'

describe('allocateSegmentDates', () => {
  it('assigns consecutive date ranges from departure start date', () => {
    const ranges = allocateSegmentDates(parseDateOnly('2026-08-01'), [3, 7])

    expect(ranges).toHaveLength(2)
    expect(ranges[0]).toMatchObject({ dayCount: 3 })
    expect(ranges[0]!.startDate!.toISOString().slice(0, 10)).toBe('2026-08-01')
    expect(ranges[0]!.endDate!.toISOString().slice(0, 10)).toBe('2026-08-03')
    expect(ranges[1]).toMatchObject({ dayCount: 7 })
    expect(ranges[1]!.startDate!.toISOString().slice(0, 10)).toBe('2026-08-04')
    expect(ranges[1]!.endDate!.toISOString().slice(0, 10)).toBe('2026-08-10')
  })

  it('keeps unset day counts as null without advancing the cursor', () => {
    const ranges = allocateSegmentDates(parseDateOnly('2026-08-01'), [2, null, 3])

    expect(ranges[0]).toMatchObject({ dayCount: 2 })
    expect(ranges[0]!.startDate!.toISOString().slice(0, 10)).toBe('2026-08-01')
    expect(ranges[0]!.endDate!.toISOString().slice(0, 10)).toBe('2026-08-02')
    expect(ranges[1]).toEqual({ startDate: null, endDate: null, dayCount: null })
    expect(ranges[2]).toMatchObject({ dayCount: 3 })
    expect(ranges[2]!.startDate!.toISOString().slice(0, 10)).toBe('2026-08-03')
    expect(ranges[2]!.endDate!.toISOString().slice(0, 10)).toBe('2026-08-05')
  })
})
