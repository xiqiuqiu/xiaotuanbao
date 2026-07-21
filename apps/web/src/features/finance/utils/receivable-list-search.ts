export type ReceivableFollowUpWindow =
  | 'overdue'
  | 'due_within_7_days'
  | 'aging_1_7'
  | 'aging_8_30'
  | 'aging_over_30'
  | 'follow_up'

export interface ReceivableListSearch {
  receivableFollowUp?: ReceivableFollowUpWindow
  scheduleNo?: string
}

const FOLLOW_UP_WINDOWS = new Set<ReceivableFollowUpWindow>([
  'overdue',
  'due_within_7_days',
  'aging_1_7',
  'aging_8_30',
  'aging_over_30',
  'follow_up',
])

export function parseReceivableListSearch(
  search: Record<string, unknown>,
): ReceivableListSearch {
  const receivableFollowUp = typeof search.receivableFollowUp === 'string'
    && FOLLOW_UP_WINDOWS.has(search.receivableFollowUp as ReceivableFollowUpWindow)
    ? search.receivableFollowUp as ReceivableFollowUpWindow
    : undefined
  const scheduleNo = typeof search.scheduleNo === 'string' && search.scheduleNo.trim()
    ? search.scheduleNo.trim()
    : undefined

  return {
    ...(receivableFollowUp ? { receivableFollowUp } : {}),
    ...(scheduleNo ? { scheduleNo } : {}),
  }
}
