import { describe, expect, it } from 'vitest'
import {
  applyVerificationDeepLink,
  buildVerificationListMatchParams,
  resolveVerificationDeepLinkSearch,
} from './verification-list-deep-link'

describe('resolveVerificationDeepLinkSearch', () => {
  it('keeps only transactionNo when both numbers are present', () => {
    expect(
      resolveVerificationDeepLinkSearch({
        transactionNo: 'TXXTB20260710000001',
        scheduleNo: 'ARXTB202607000001',
      }),
    ).toEqual({ transactionNo: 'TXXTB20260710000001' })
  })

  it('ignores blank values', () => {
    expect(resolveVerificationDeepLinkSearch({ transactionNo: '  ', scheduleNo: '' })).toEqual({})
  })
})

describe('applyVerificationDeepLink', () => {
  it('fills transactionNo, clears other filters and date, and locks exact match', () => {
    const state = applyVerificationDeepLink({ transactionNo: 'TXXTB20260710000001' })

    expect(state).toEqual({
      dateRange: null,
      direction: undefined,
      status: undefined,
      transactionNo: 'TXXTB20260710000001',
      scheduleNo: '',
      departureKeyword: '',
      lock: 'transactionNo',
    })
  })

  it('fills scheduleNo deep link the same way', () => {
    const state = applyVerificationDeepLink({ scheduleNo: 'ARXTB202607000001' })

    expect(state.lock).toBe('scheduleNo')
    expect(state.scheduleNo).toBe('ARXTB202607000001')
    expect(state.transactionNo).toBe('')
    expect(state.dateRange).toBeNull()
  })

  it('returns unlocked empty filters when search has no business number', () => {
    const state = applyVerificationDeepLink({})

    expect(state.lock).toBeNull()
    expect(state.transactionNo).toBe('')
    expect(state.scheduleNo).toBe('')
    expect(state.dateRange).toBeNull()
  })
})

describe('buildVerificationListMatchParams', () => {
  it('sends exact match only for the locked field', () => {
    expect(
      buildVerificationListMatchParams({
        transactionNo: 'TXXTB20260710000001',
        scheduleNo: '',
        lock: 'transactionNo',
      }),
    ).toEqual({
      transactionNo: 'TXXTB20260710000001',
      transactionNoMatch: 'exact',
    })
  })

  it('omits match mode when unlocked so API defaults to contains', () => {
    expect(
      buildVerificationListMatchParams({
        transactionNo: 'TX',
        scheduleNo: 'AR',
        lock: null,
      }),
    ).toEqual({
      transactionNo: 'TX',
      scheduleNo: 'AR',
    })
  })
})
