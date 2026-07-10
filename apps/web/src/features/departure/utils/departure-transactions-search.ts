import type { TransactionDirection } from '@xiaotuanbao/shared'

/** Deep-link search for the departure detail transactions tab (optional direction filter). */
export function buildDepartureTransactionTabSearch(direction?: TransactionDirection): {
  tab: 'transactions'
  direction?: TransactionDirection
} {
  return {
    tab: 'transactions',
    ...(direction ? { direction } : {}),
  }
}
