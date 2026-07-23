import { Injectable } from '@nestjs/common'
import {
  DepartureStatus,
  PaymentScheduleDirection,
  type Prisma,
} from '@prisma/client'
import type {
  PendingPayableSegmentResourceItem,
  PendingPayableSegmentResourceListResult,
} from '@xiaotuanbao/shared'
import { PaymentScheduleSourceType } from '@xiaotuanbao/shared'
import { PrismaService } from '../../database/prisma/prisma.service'
import { formatDateOnly } from './departure-date.utils'

export type PendingPayableSegmentResourceRow = Prisma.SegmentResourceGetPayload<{
  include: {
    partner: { select: { name: true } }
    supplier: { select: { name: true } }
    segment: {
      select: {
        name: true
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
    }
  }
}>

@Injectable()
export class SegmentResourcePayableGapService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 待生成应付：金额 > 0 且尚无有效（未作废）资源应付节点的行程资源。
   * 已关闭节点仍视为已生成；已关闭发团不排除。
   */
  async findPendingRows(organizationId: string): Promise<PendingPayableSegmentResourceRow[]> {
    const rows = await this.prisma.segmentResource.findMany({
      where: {
        amountCents: { gt: 0 },
        segment: {
          departure: {
            organizationId,
            // 已结清发团不可再生成应付（CONTEXT Departure Status）。
            status: { not: DepartureStatus.settled },
          },
        },
      },
      include: {
        partner: { select: { name: true } },
        supplier: { select: { name: true } },
        segment: {
          select: {
            name: true,
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
        },
      },
      orderBy: [
        { segment: { departure: { startDate: 'asc' } } },
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
            direction: PaymentScheduleDirection.payable,
            sourceType: PaymentScheduleSourceType.SEGMENT_RESOURCE,
            sourceId: { in: rows.map(({ id }) => id) },
            voidedAt: null,
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
  ): Promise<PendingPayableSegmentResourceListResult> {
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

function toItem(row: PendingPayableSegmentResourceRow): PendingPayableSegmentResourceItem {
  const departure = row.segment.departure
  return {
    id: row.id,
    title: row.title,
    counterpartyName: row.partner?.name ?? row.supplier?.name ?? null,
    amountCents: row.amountCents,
    departureId: departure.id,
    departureNo: departure.departureNo,
    departureName: departure.name,
    departureStartDate: formatDateOnly(departure.startDate),
    departureClosed: departure.status === DepartureStatus.closed,
    href: `/departure/${departure.id}?tab=execution&highlightSegmentResourceId=${encodeURIComponent(row.id)}`,
  }
}
