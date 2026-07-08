import { TransactionDirection } from '@xiaotuanbao/shared'
import type { FinanceTransactionSummary } from '@xiaotuanbao/shared'
import { describe, expect, it } from 'vitest'
import { filterCandidateTransactions } from './verification-candidates'

const departureMap = new Map([
  ['dep-1', { departureNo: 'DT202601', name: '云南六日游' }],
])

function makeTransaction(
  overrides: Partial<FinanceTransactionSummary> = {},
): FinanceTransactionSummary {
  return {
    id: 'tx-1',
    transactionNo: 'TX202601000001',
    direction: TransactionDirection.INFLOW,
    paymentChannel: 'bank_transfer',
    amountCents: 100000,
    allocatedAmountCents: 0,
    unallocatedAmountCents: 100000,
    transactionDate: '2026-01-15',
    counterpartyType: 'customer',
    counterpartyId: 'cp-1',
    counterpartyName: '华东国旅',
    departureId: 'dep-1',
    voidedAt: null,
    voidReason: null,
    notes: null,
    createdAt: '2026-01-15T00:00:00.000Z',
    updatedAt: '2026-01-15T00:00:00.000Z',
    ...overrides,
  }
}

describe('filterCandidateTransactions', () => {
  it('filters by search keyword on transaction number', () => {
    const transactions = [
      makeTransaction({ id: 'tx-1', transactionNo: 'TX202601000001' }),
      makeTransaction({ id: 'tx-2', transactionNo: 'TX202601000002' }),
    ]

    const result = filterCandidateTransactions({
      transactions,
      direction: 'receivable',
      departureMap,
      searchKeyword: '000002',
    })

    expect(result).toHaveLength(1)
    expect(result[0]?.id).toBe('tx-2')
  })

  it('filters by search keyword on counterparty name', () => {
    const transactions = [
      makeTransaction({ id: 'tx-1', counterpartyName: '华东国旅' }),
      makeTransaction({ id: 'tx-2', counterpartyName: '西南旅行社' }),
    ]

    const result = filterCandidateTransactions({
      transactions,
      direction: 'receivable',
      departureMap,
      searchKeyword: '西南',
    })

    expect(result).toHaveLength(1)
    expect(result[0]?.id).toBe('tx-2')
  })

  it('filters by search keyword on departure label', () => {
    const transactions = [
      makeTransaction({ id: 'tx-1', departureId: 'dep-1' }),
      makeTransaction({ id: 'tx-2', departureId: null }),
    ]

    const result = filterCandidateTransactions({
      transactions,
      direction: 'receivable',
      departureMap,
      searchKeyword: '云南',
    })

    expect(result).toHaveLength(1)
    expect(result[0]?.id).toBe('tx-1')
  })

  it('filters by search keyword on counterparty type label', () => {
    const transactions = [
      makeTransaction({
        id: 'tx-1',
        counterpartyType: 'partner',
        counterpartyName: '黄山徽行天下地接',
      }),
    ]

    const result = filterCandidateTransactions({
      transactions,
      direction: 'receivable',
      departureMap,
      searchKeyword: '合作伙伴',
    })

    expect(result).toHaveLength(1)
    expect(result[0]?.id).toBe('tx-1')
  })

  it('filters by counterparty keyword on type label', () => {
    const transactions = [
      makeTransaction({
        id: 'tx-1',
        counterpartyType: 'partner',
        counterpartyName: '黄山徽行天下地接',
      }),
      makeTransaction({
        id: 'tx-2',
        counterpartyType: 'guest',
        counterpartyName: '张三',
      }),
    ]

    const result = filterCandidateTransactions({
      transactions,
      direction: 'receivable',
      departureMap,
      counterpartyKeyword: '合作伙伴',
    })

    expect(result).toHaveLength(1)
    expect(result[0]?.id).toBe('tx-1')
  })
})
