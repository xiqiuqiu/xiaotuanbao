import { describe, expect, it } from 'vitest'
import {
  DEPARTURE_DETAIL_TABS,
  isDepartureDetailTabVisible,
  type DepartureDetailTabKey,
} from './catalog'

const COORDINATOR_MENU_KEYS = ['/', '/departure', '/partner', '/supplier']
const FINANCE_MENU_KEYS = [
  ...COORDINATOR_MENU_KEYS,
  '/finance/receivable',
  '/finance/payable',
  '/finance/transactions',
  '/finance/verification',
]

function visibleTabKeys(menuKeys: string[]): DepartureDetailTabKey[] {
  return DEPARTURE_DETAIL_TABS.filter((tab) =>
    isDepartureDetailTabVisible(tab.key, menuKeys),
  ).map((tab) => tab.key)
}

describe('isDepartureDetailTabVisible (ADR-0023)', () => {
  it('hides 收支流水/核销记录 tabs for 计调 (no /finance/* menus)', () => {
    const keys = visibleTabKeys(COORDINATOR_MENU_KEYS)

    expect(keys).not.toContain('transactions')
    expect(keys).not.toContain('verifications')
    // DEV 下多一个 throwaway「增收记录」原型 Tab；PROD 构建中会隐藏。
    const expected = import.meta.env.DEV
      ? ['overview', 'sourceOrders', 'execution', 'incomeRecords', 'receivables', 'payables']
      : ['overview', 'sourceOrders', 'execution', 'receivables', 'payables']
    expect(keys).toEqual(expected)
  })

  it('keeps 应收/应付 tabs visible for 计调', () => {
    expect(isDepartureDetailTabVisible('receivables', COORDINATOR_MENU_KEYS)).toBe(true)
    expect(isDepartureDetailTabVisible('payables', COORDINATOR_MENU_KEYS)).toBe(true)
  })

  it('shows finance tabs for 财务/管理员 with the finance menus', () => {
    const expected = import.meta.env.DEV
      ? [
          'overview',
          'sourceOrders',
          'execution',
          'incomeRecords',
          'receivables',
          'payables',
          'transactions',
          'verifications',
        ]
      : [
          'overview',
          'sourceOrders',
          'execution',
          'receivables',
          'payables',
          'transactions',
          'verifications',
        ]
    expect(visibleTabKeys(FINANCE_MENU_KEYS)).toEqual(expected)
  })

  it('gates 增收记录 prototype tab to DEV only', () => {
    expect(isDepartureDetailTabVisible('incomeRecords', COORDINATOR_MENU_KEYS)).toBe(
      import.meta.env.DEV,
    )
  })

  it('drives 收支流水 tab by /finance/transactions and 核销记录 by /finance/verification', () => {
    expect(isDepartureDetailTabVisible('transactions', ['/finance/transactions'])).toBe(true)
    expect(isDepartureDetailTabVisible('transactions', ['/finance/verification'])).toBe(false)
    expect(isDepartureDetailTabVisible('verifications', ['/finance/verification'])).toBe(true)
    expect(isDepartureDetailTabVisible('verifications', ['/finance/transactions'])).toBe(false)
  })
})
