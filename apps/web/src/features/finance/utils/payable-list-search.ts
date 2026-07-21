export interface PayableListSearch {
  payableBalance?: 'open_unpaid'
  scheduleNo?: string
}

export function parsePayableListSearch(
  search: Record<string, unknown>,
): PayableListSearch {
  const payableBalance = search.payableBalance === 'open_unpaid'
    ? 'open_unpaid' as const
    : undefined
  const scheduleNo = typeof search.scheduleNo === 'string' && search.scheduleNo.trim()
    ? search.scheduleNo.trim()
    : undefined

  return {
    ...(payableBalance ? { payableBalance } : {}),
    ...(scheduleNo ? { scheduleNo } : {}),
  }
}
