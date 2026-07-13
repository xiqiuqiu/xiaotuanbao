import type { CounterpartyType, Prisma } from '@prisma/client'

export type PaymentScheduleCounterpartyFilterQuery = {
  counterpartyType?: string
  counterpartyId?: string
  counterpartyName?: string
}

export type PaymentScheduleCounterpartyRow = {
  counterpartyType: string
  counterpartyId: string | null
  counterpartyName: string | null
}

export function buildPaymentScheduleCounterpartyWhere(
  query: PaymentScheduleCounterpartyFilterQuery,
): Prisma.PaymentScheduleWhereInput | undefined {
  const counterpartyType = query.counterpartyType?.trim()
  if (!counterpartyType) {
    return undefined
  }

  const typedCounterpartyType = counterpartyType as CounterpartyType
  const counterpartyId = query.counterpartyId?.trim()
  if (counterpartyId) {
    return { counterpartyType: typedCounterpartyType, counterpartyId }
  }

  const counterpartyName = query.counterpartyName?.trim()
  if (counterpartyName) {
    return {
      counterpartyType: typedCounterpartyType,
      counterpartyId: null,
      counterpartyName,
    }
  }

  return { counterpartyType: typedCounterpartyType }
}

function counterpartyKey(row: PaymentScheduleCounterpartyRow): string {
  const id = row.counterpartyId?.trim()
  if (id) {
    return `${row.counterpartyType}|id|${id}`
  }
  return `${row.counterpartyType}|name|${row.counterpartyName?.trim() ?? ''}`
}

export function dedupePaymentScheduleCounterparties(
  rows: PaymentScheduleCounterpartyRow[],
): PaymentScheduleCounterpartyRow[] {
  const byKey = new Map<string, PaymentScheduleCounterpartyRow>()

  for (const row of rows) {
    const key = counterpartyKey(row)
    if (byKey.has(key)) {
      continue
    }
    byKey.set(key, {
      counterpartyType: row.counterpartyType,
      counterpartyId: row.counterpartyId?.trim() || null,
      counterpartyName: row.counterpartyName?.trim() || null,
    })
  }

  return [...byKey.values()].sort((left, right) => {
    const leftName = left.counterpartyName ?? ''
    const rightName = right.counterpartyName ?? ''
    const byName = leftName.localeCompare(rightName, 'zh-CN')
    if (byName !== 0) {
      return byName
    }
    return left.counterpartyType.localeCompare(right.counterpartyType)
  })
}
