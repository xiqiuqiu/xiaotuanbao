import { TransactionWriteoffStatus } from '../enums/transaction-writeoff-status.enum'
import { deriveTransactionWriteoffStatus } from './derive-transaction-writeoff-status'

describe('deriveTransactionWriteoffStatus', () => {
  it('returns none when allocated is zero', () => {
    expect(deriveTransactionWriteoffStatus(50000, 0)).toEqual({
      status: TransactionWriteoffStatus.NONE,
      label: '未核销',
    })
  })

  it('returns partial when allocated is between zero and amount', () => {
    expect(deriveTransactionWriteoffStatus(50000, 20000)).toEqual({
      status: TransactionWriteoffStatus.PARTIAL,
      label: '部分核销',
    })
  })

  it('returns done when allocated equals amount', () => {
    expect(deriveTransactionWriteoffStatus(50000, 50000)).toEqual({
      status: TransactionWriteoffStatus.DONE,
      label: '已核销',
    })
  })

  it('returns done when allocated exceeds amount', () => {
    expect(deriveTransactionWriteoffStatus(50000, 60000)).toEqual({
      status: TransactionWriteoffStatus.DONE,
      label: '已核销',
    })
  })
})
