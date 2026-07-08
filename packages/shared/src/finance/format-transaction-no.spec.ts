import { formatTransactionNo } from './format-transaction-no'

describe('formatTransactionNo', () => {
  it('formats TX numbers with daily period', () => {
    expect(formatTransactionNo('XTB', '20260708', 1)).toBe('TXXTB20260708000001')
  })
})
