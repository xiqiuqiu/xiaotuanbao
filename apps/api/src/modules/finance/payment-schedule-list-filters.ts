import type { CounterpartyType, Prisma } from '@prisma/client'

export type PaymentScheduleCounterpartyFilterQuery = {
  counterpartyType?: string
  counterpartyId?: string
  counterpartyName?: string
  counterpartyKeyword?: string
}

export function buildPaymentScheduleCounterpartyWhere(
  query: PaymentScheduleCounterpartyFilterQuery,
): Prisma.PaymentScheduleWhereInput | undefined {
  const filters: Prisma.PaymentScheduleWhereInput[] = []

  const counterpartyType = query.counterpartyType?.trim()
  if (counterpartyType) {
    const typedCounterpartyType = counterpartyType as CounterpartyType
    const counterpartyId = query.counterpartyId?.trim()
    if (counterpartyId) {
      filters.push({ counterpartyType: typedCounterpartyType, counterpartyId })
    } else {
      const counterpartyName = query.counterpartyName?.trim()
      if (counterpartyName) {
        filters.push({
          counterpartyType: typedCounterpartyType,
          counterpartyId: null,
          counterpartyName,
        })
      } else {
        filters.push({ counterpartyType: typedCounterpartyType })
      }
    }
  }

  const counterpartyKeyword = query.counterpartyKeyword?.trim()
  if (counterpartyKeyword) {
    filters.push({ counterpartyName: { contains: counterpartyKeyword } })
  }

  if (filters.length === 0) {
    return undefined
  }
  if (filters.length === 1) {
    return filters[0]
  }
  return { AND: filters }
}
