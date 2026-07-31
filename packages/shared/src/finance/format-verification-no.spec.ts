import { formatVerificationNo } from './format-verification-no'

describe('formatVerificationNo', () => {
  it('formats CL numbers with monthly period', () => {
    expect(formatVerificationNo('XTB', '2607', 1)).toBe('CLXTB2607000001')
  })
})
