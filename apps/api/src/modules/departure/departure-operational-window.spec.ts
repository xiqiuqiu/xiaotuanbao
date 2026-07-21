import { listRecentCalendarMonths } from './departure-operational-window'

describe('listRecentCalendarMonths', () => {
  it('returns six Asia/Shanghai natural months ending at the current month', () => {
    // 2026-07-21 16:00 UTC = 2026-07-22 00:00 Asia/Shanghai
    const asOf = new Date('2026-07-21T16:00:00.000Z')
    const months = listRecentCalendarMonths(asOf, 6)

    expect(months).toEqual([
      { month: '2026-02', start: '2026-02-01', end: '2026-02-28' },
      { month: '2026-03', start: '2026-03-01', end: '2026-03-31' },
      { month: '2026-04', start: '2026-04-01', end: '2026-04-30' },
      { month: '2026-05', start: '2026-05-01', end: '2026-05-31' },
      { month: '2026-06', start: '2026-06-01', end: '2026-06-30' },
      { month: '2026-07', start: '2026-07-01', end: '2026-07-31' },
    ])
  })

  it('crosses the year boundary when counting back from January', () => {
    // 2026-01-01 00:00 Asia/Shanghai
    const asOf = new Date('2025-12-31T16:00:00.000Z')
    const months = listRecentCalendarMonths(asOf, 3)

    expect(months).toEqual([
      { month: '2025-11', start: '2025-11-01', end: '2025-11-30' },
      { month: '2025-12', start: '2025-12-01', end: '2025-12-31' },
      { month: '2026-01', start: '2026-01-01', end: '2026-01-31' },
    ])
  })
})
