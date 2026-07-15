import { BadRequestException } from '@nestjs/common'
import type { CounterpartyType, Prisma } from '@prisma/client'
import { parseDateOnly } from '../departure/departure-date.utils'

export type PaymentScheduleCounterpartyFilterQuery = {
  counterpartyType?: string
  counterpartyId?: string
  counterpartyName?: string
  counterpartyKeyword?: string
}

export type PaymentScheduleDepartureDateFilterQuery = {
  departureDateFrom?: string
  departureDateTo?: string
}

/**
 * 按关联发团出团日期（Departure.startDate）过滤收付款节点；
 * 手工节点（sourceType=manual）随其归属发团的出团日期落入区间。
 */
export function buildPaymentScheduleDepartureDateWhere(
  query: PaymentScheduleDepartureDateFilterQuery,
): Prisma.PaymentScheduleWhereInput | undefined {
  const { departureDateFrom, departureDateTo } = query
  if (!departureDateFrom && !departureDateTo) {
    return undefined
  }
  if (departureDateFrom && departureDateTo && departureDateFrom > departureDateTo) {
    throw new BadRequestException('出团日期区间非法')
  }
  return {
    departure: {
      startDate: {
        ...(departureDateFrom ? { gte: parseDateOnly(departureDateFrom) } : {}),
        ...(departureDateTo ? { lte: parseDateOnly(departureDateTo) } : {}),
      },
    },
  }
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
