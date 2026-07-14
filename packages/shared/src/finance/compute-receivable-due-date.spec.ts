import { computeReceivableDueDate } from './compute-receivable-due-date'

describe('computeReceivableDueDate', () => {
  it('uses the 10th of the month after the departure start month', () => {
    expect(computeReceivableDueDate('2026-05-20')).toBe('2026-06-10')
    expect(computeReceivableDueDate('2026-07-14')).toBe('2026-08-10')
    expect(computeReceivableDueDate('2026-07-01')).toBe('2026-08-10')
  })

  it('rolls December departures into January of the next year', () => {
    expect(computeReceivableDueDate('2026-12-31')).toBe('2027-01-10')
  })
})
