export interface CounterpartySnapshot {
  counterpartyType: string
  counterpartyId: string | null
  counterpartyName: string | null
}

export class CounterpartyMismatchError extends Error {
  constructor(message = '往来对象不匹配') {
    super(message)
    this.name = 'CounterpartyMismatchError'
  }
}

export function assertCounterpartyMatch(
  schedule: CounterpartySnapshot,
  transaction: CounterpartySnapshot,
): void {
  if (schedule.counterpartyType !== transaction.counterpartyType) {
    throw new CounterpartyMismatchError('往来类型不匹配')
  }

  const scheduleId = schedule.counterpartyId?.trim() || null
  const transactionId = transaction.counterpartyId?.trim() || null

  if (scheduleId || transactionId) {
    if (scheduleId !== transactionId) {
      throw new CounterpartyMismatchError('往来对象不匹配')
    }
    return
  }

  const scheduleName = schedule.counterpartyName?.trim() || ''
  const transactionName = transaction.counterpartyName?.trim() || ''
  if (scheduleName !== transactionName) {
    throw new CounterpartyMismatchError('往来名称不匹配')
  }
}
