import { Injectable } from '@nestjs/common'
import { DepartureStatus } from '@prisma/client'
import type {
  PendingPayableSegmentResourceItem,
  PendingPayableSegmentResourceListResult,
} from '@xiaotuanbao/shared'
import { PaymentScheduleSourceType } from '@xiaotuanbao/shared'
import { PrismaService } from '../../database/prisma/prisma.service'
import {
  DepartureFinanceFacade,
  resourcePresenceMapKey,
  type ResourcePresenceKey,
} from '../finance/departure-finance-facade.service'
import { formatDateOnly } from './departure-date.utils'

@Injectable()
export class SegmentResourcePayableGapService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly departureFinanceFacade: DepartureFinanceFacade,
  ) {}

  /**
   * 待提交应付：金额 > 0 且尚无有效（未作废）资源应付节点的段资源 ∪ 发团级资源。
   * 已关闭节点仍视为已生成；已关闭发团不排除；已结清发团排除。
   */
  async findPendingItems(
    organizationId: string,
  ): Promise<PendingPayableSegmentResourceItem[]> {
    const [segmentRows, departureRows] = await Promise.all([
      this.prisma.segmentResource.findMany({
        where: {
          amountCents: { gt: 0 },
          segment: {
            departure: {
              organizationId,
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
      }),
      this.prisma.departureResource.findMany({
        where: {
          amountCents: { gt: 0 },
          departure: {
            organizationId,
            status: { not: DepartureStatus.settled },
          },
        },
        include: {
          partner: { select: { name: true } },
          supplier: { select: { name: true } },
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
        orderBy: [{ departure: { startDate: 'asc' } }, { createdAt: 'asc' }],
      }),
    ])

    if (segmentRows.length === 0 && departureRows.length === 0) {
      return []
    }

    const presenceKeys: ResourcePresenceKey[] = [
      ...segmentRows.map(
        ({ id }) =>
          ({
            sourceType: PaymentScheduleSourceType.SEGMENT_RESOURCE,
            sourceId: id,
          }) satisfies ResourcePresenceKey,
      ),
      ...departureRows.map(
        ({ id }) =>
          ({
            sourceType: PaymentScheduleSourceType.DEPARTURE_RESOURCE,
            sourceId: id,
          }) satisfies ResourcePresenceKey,
      ),
    ]
    const presenceMap = await this.departureFinanceFacade.getResourceFinancePresences(
      organizationId,
      presenceKeys,
    )

    const segmentItems = segmentRows
      .filter(
        ({ id }) =>
          !presenceMap.get(
            resourcePresenceMapKey(PaymentScheduleSourceType.SEGMENT_RESOURCE, id),
          )?.isGenerated,
      )
      .map((row) => {
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
          segmentName: row.segment.name,
          resourceKind: row.resourceKind,
        } satisfies PendingPayableSegmentResourceItem & {
          segmentName: string
          resourceKind: string
        }
      })

    const departureItems = departureRows
      .filter(
        ({ id }) =>
          !presenceMap.get(
            resourcePresenceMapKey(PaymentScheduleSourceType.DEPARTURE_RESOURCE, id),
          )?.isGenerated,
      )
      .map((row) => {
        const departure = row.departure
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
          href: `/departure/${departure.id}?tab=execution&highlightDepartureResourceId=${encodeURIComponent(row.id)}`,
          segmentName: '发团级',
          resourceKind: row.resourceKind,
        } satisfies PendingPayableSegmentResourceItem & {
          segmentName: string
          resourceKind: string
        }
      })

    return [...segmentItems, ...departureItems].sort((left, right) => {
      if (left.departureStartDate !== right.departureStartDate) {
        return left.departureStartDate.localeCompare(right.departureStartDate)
      }
      return left.id.localeCompare(right.id)
    })
  }

  /** @deprecated Prefer findPendingItems — kept for callers migrating in #205. */
  async findPendingRows(
    organizationId: string,
  ): Promise<Array<PendingPayableSegmentResourceItem & { segmentName: string; resourceKind: string }>> {
    const items = await this.findPendingItems(organizationId)
    return items as Array<
      PendingPayableSegmentResourceItem & { segmentName: string; resourceKind: string }
    >
  }

  async listPending(
    organizationId: string,
    pageInput?: number,
    pageSizeInput?: number,
  ): Promise<PendingPayableSegmentResourceListResult> {
    const page = Math.max(Number(pageInput) || 1, 1)
    const pageSize = Math.min(Math.max(Number(pageSizeInput) || 10, 1), 100)
    const items = await this.findPendingItems(organizationId)
    const start = (page - 1) * pageSize

    return {
      items: items.slice(start, start + pageSize),
      total: items.length,
      page,
      pageSize,
    }
  }
}
