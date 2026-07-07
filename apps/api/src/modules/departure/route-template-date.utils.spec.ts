import { parseDateOnly } from './departure-date.utils'
import { allocateSegmentDates } from './route-template-date.utils'

describe('allocateSegmentDates', () => {
  it('assigns consecutive date ranges from departure start date', () => {
    const ranges = allocateSegmentDates(parseDateOnly('2026-08-01'), [3, 7])

    expect(ranges).toHaveLength(2)
    expect(ranges[0].startDate.toISOString().slice(0, 10)).toBe('2026-08-01')
    expect(ranges[0].endDate.toISOString().slice(0, 10)).toBe('2026-08-03')
    expect(ranges[0].dayCount).toBe(3)
    expect(ranges[1].startDate.toISOString().slice(0, 10)).toBe('2026-08-04')
    expect(ranges[1].endDate.toISOString().slice(0, 10)).toBe('2026-08-10')
    expect(ranges[1].dayCount).toBe(7)
  })
})
