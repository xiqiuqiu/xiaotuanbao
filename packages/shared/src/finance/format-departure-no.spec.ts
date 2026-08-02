import { formatDepartureNo } from './format-departure-no'

describe('formatDepartureNo', () => {
  it('pads sequence to 4 digits', () => {
    expect(formatDepartureNo('XTB', '2607', 1)).toBe('XTB26070001')
    expect(formatDepartureNo('XAT', '2608', 9999)).toBe('XAT26089999')
  })

  it('still concatenates legacy four-digit-year period keys', () => {
    expect(formatDepartureNo('XTB', '202607', 1)).toBe('XTB2026070001')
  })
})
