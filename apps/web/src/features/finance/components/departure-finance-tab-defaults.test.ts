import { describe, expect, it } from 'vitest'
import { TransactionDirection } from '@xiaotuanbao/shared'
import { createInitialTransactionListState } from './TransactionsWorkspace'
import { createDefaultVerificationListState } from './VerificationsWorkspace'

describe('departure finance tab default filters', () => {
  it('does not default a date window for departure transaction lists', () => {
    const state = createInitialTransactionListState({
      scope: 'departure',
      direction: TransactionDirection.INFLOW,
    })

    expect(state.dateRange).toBeNull()
    expect(state.direction).toBe(TransactionDirection.INFLOW)
  })

  it('keeps the global near-30-day default for transaction lists', () => {
    const state = createInitialTransactionListState({ scope: 'global' })
    expect(state.dateRange).not.toBeNull()
    expect(state.dateRange?.[0]).toBeTruthy()
    expect(state.dateRange?.[1]).toBeTruthy()
  })

  it('does not default a date window for departure verification lists', () => {
    expect(createDefaultVerificationListState('departure').dateRange).toBeNull()
  })

  it('keeps the global near-30-day default for verification lists', () => {
    const state = createDefaultVerificationListState('global')
    expect(state.dateRange).not.toBeNull()
  })
})
