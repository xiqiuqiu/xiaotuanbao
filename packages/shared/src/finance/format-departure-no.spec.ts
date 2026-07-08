import { formatDepartureNo } from './format-departure-no'

describe('formatDepartureNo', () => {
  it('pads sequence to 4 digits', () => {
    expect(formatDepartureNo('XTB', '202607', 1)).toBe('XTB2026070001')
    expect(formatDepartureNo('XAT', '202608', 9999)).toBe('XAT2026089999')
  })
})
