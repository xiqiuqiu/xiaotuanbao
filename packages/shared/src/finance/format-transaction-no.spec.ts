import { formatTransactionNo } from './format-transaction-no'

describe('formatTransactionNo', () => {
  it('formats TX numbers with daily period', () => {
    expect(formatTransactionNo('XTB', '260708', 1)).toBe('TXXTB260708000001')
  })
})
