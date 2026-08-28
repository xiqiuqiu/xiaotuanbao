import {
  formatOutOfRangeItinerarySegmentSummary,
  listOutOfRangeItinerarySegments,
  listTourDays,
  listUncoveredTourDays,
} from './daily-segment-skeleton'

describe('daily-segment-skeleton', () => {
  it('lists inclusive tour days as YYYY-MM-DD', () => {
    expect(listTourDays('2026-08-01', '2026-08-03')).toEqual([
      '2026-08-01',
      '2026-08-02',
      '2026-08-03',
    ])
  })

  it('lists only uncovered days when a multi-day itinerary segment already covers part of the period', () => {
    expect(
      listUncoveredTourDays('2026-10-01', '2026-10-03', [
        { startDate: '2026-10-01', endDate: '2026-10-02' },
      ]),
    ).toEqual(['2026-10-03'])
  })

  it('does not list a day already covered by a one-day itinerary segment', () => {
    expect(
      listUncoveredTourDays('2026-08-01', '2026-08-03', [
        { startDate: '2026-08-01', endDate: '2026-08-01' },
        { startDate: '2026-08-02', endDate: '2026-08-02' },
        { startDate: '2026-08-03', endDate: '2026-08-03' },
      ]),
    ).toEqual([])
  })

  it('does not treat an undated itinerary segment as covering any day', () => {
    expect(
      listUncoveredTourDays('2026-11-01', '2026-11-01', [
        { startDate: null, endDate: null },
      ]),
    ).toEqual(['2026-11-01'])
  })

  it('treats an empty one-day skeleton past the new end date as out of range', () => {
    expect(
      listOutOfRangeItinerarySegments('2026-12-01', '2026-12-01', [
        { id: 'day-1', name: '第1天', startDate: '2026-12-01', endDate: '2026-12-01' },
        { id: 'day-2', name: '第2天', startDate: '2026-12-02', endDate: '2026-12-02' },
      ]),
    ).toEqual([
      { id: 'day-2', name: '第2天', startDate: '2026-12-02', endDate: '2026-12-02' },
    ])
  })

  it('treats a multi-day itinerary segment that ends after the new period as out of range', () => {
    expect(
      listOutOfRangeItinerarySegments('2026-12-01', '2026-12-02', [
        { id: 'span', name: '跨日段', startDate: '2026-12-01', endDate: '2026-12-03' },
      ]),
    ).toEqual([
      { id: 'span', name: '跨日段', startDate: '2026-12-01', endDate: '2026-12-03' },
    ])
  })

  it('does not flag in-range or undated itinerary segments as out of range', () => {
    expect(
      listOutOfRangeItinerarySegments('2026-12-01', '2026-12-02', [
        { id: 'in', name: '第1天', startDate: '2026-12-01', endDate: '2026-12-01' },
        { id: 'open', name: '未定日期', startDate: null, endDate: null },
      ]),
    ).toEqual([])
  })

  it('formats an actionable summary of out-of-range itinerary segments', () => {
    expect(
      formatOutOfRangeItinerarySegmentSummary({
        code: 'ITINERARY_SEGMENT_OUT_OF_RANGE',
        periodStartDate: '2026-12-01',
        periodEndDate: '2026-12-01',
        segments: [
          { id: 'day-2', name: '第2天', startDate: '2026-12-02', endDate: '2026-12-02' },
          { id: 'span', name: '跨日有资源', startDate: '2026-12-01', endDate: '2026-12-03' },
        ],
      }),
    ).toBe(
      '保存被拒绝：存在超出新团期（2026-12-01～2026-12-01）的行程段，请先调整后再保存。第2天（2026-12-02）；跨日有资源（2026-12-01～2026-12-03）',
    )
  })
})
