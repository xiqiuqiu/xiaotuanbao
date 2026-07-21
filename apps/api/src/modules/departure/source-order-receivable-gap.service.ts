import { Injectable } from '@nestjs/common'
import {
  DepartureStatus,
  PaymentScheduleDirection,
  type Prisma,
} from '@prisma/client'
import type {
  PendingReceivableSourceOrderItem,
  PendingReceivableSourceOrderListResult,
} from '@xiaotuanbao/shared'
import { PaymentScheduleSourceType } from '@xiaotuanbao/shared'
import { PrismaService } from '../../database/prisma/prisma.service'
import { formatDateOnly } from './departure-date.utils'

const SOURCE_ORDER_RECEIVABLE_TYPES = [
  PaymentScheduleSourceType.SOURCE_ORDER_CUSTOMER_SETTLEMENT,
  PaymentScheduleSourceType.SOURCE_ORDER_GUEST_COLLECTION,
] as const

export type PendingReceivableSourceOrderRow = Prisma.SourceOrderGetPayload<{
  include: {
    partner: { select: { name: true } }
    departure: {
      select: {
        id: true
        departureNo: true
        name: true
        startDate: true
        status: true
      }
    }
  }
}>

@Injectable()
export class SourceOrderReceivableGapService {
  constructor(private readonly prisma: PrismaService) {}

  async findPendingRows(organizationId: string): Promise<PendingReceivableSourceOrderRow[]> {
    const rows = await this.prisma.sourceOrder.findMany({
      where: {
        departure: {
          organizationId,
          // 已结清发团不可再生成应收（CONTEXT Departure Status）。
          status: { not: DepartureStatus.settled },
        },
      },
      include: {
        partner: { select: { name: true } },
        departure: {
          select: {
            id: true,
            departureNo: true,
            name: true,
            startDate: true,
            status: true,
          },
        },
      },
      orderBy: [
        { departure: { startDate: 'asc' } },
        { createdAt: 'asc' },
      ],
    })
    if (rows.length === 0) {
      return []
    }

    const generatedSourceIds = new Set(
      (
        await this.prisma.paymentSchedule.findMany({
          where: {
            organizationId,
            direction: PaymentScheduleDirection.receivable,
            sourceType: { in: [...SOURCE_ORDER_RECEIVABLE_TYPES] },
            sourceId: { in: rows.map(({ id }) => id) },
          },
          select: { sourceId: true },
          distinct: ['sourceId'],
        })
      ).flatMap(({ sourceId }) => (sourceId ? [sourceId] : [])),
    )

    return rows.filter(({ id }) => !generatedSourceIds.has(id))
  }

  async listPending(
    organizationId: string,
    pageInput?: number,
    pageSizeInput?: number,
  ): Promise<PendingReceivableSourceOrderListResult> {
    const page = Math.max(Number(pageInput) || 1, 1)
    const pageSize = Math.min(Math.max(Number(pageSizeInput) || 10, 1), 100)
    const rows = await this.findPendingRows(organizationId)
    const start = (page - 1) * pageSize

    return {
      items: rows.slice(start, start + pageSize).map(toItem),
      total: rows.length,
      page,
      pageSize,
    }
  }
}

function toItem(row: PendingReceivableSourceOrderRow): PendingReceivableSourceOrderItem {
  return {
    id: row.id,
    displayName: row.displayName,
    partnerName: row.partner.name,
    departureId: row.departure.id,
    departureNo: row.departure.departureNo,
    departureName: row.departure.name,
    departureStartDate: formatDateOnly(row.departure.startDate),
    netReceivableCents: row.netReceivableCents,
    href: `/departure/${row.departure.id}?tab=sourceOrders`,
  }
}
