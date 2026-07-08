import { formatVerificationNo } from './format-verification-no'

describe('formatVerificationNo', () => {
  it('formats CL numbers with monthly period', () => {
    expect(formatVerificationNo('XTB', '202607', 1)).toBe('CLXTB202607000001')
  })
})
