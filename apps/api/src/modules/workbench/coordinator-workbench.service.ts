import { Injectable } from '@nestjs/common'
import type {
  DepartureDataGap,
  WorkbenchCoordinatorDepartureItem,
  WorkbenchModule,
} from '@xiaotuanbao/shared'
import type { Prisma } from '@prisma/client'
import { PrismaService } from '../../database/prisma/prisma.service'
import { formatDateOnly, parseDateOnly } from '../departure/departure-date.utils'
import { DepartureDataGapService } from '../departure/departure-data-gap.service'
import {
  buildDepartureOperationalWindowWhere,
  getDepartureOperationalDates,
} from '../departure/departure-operational-window'

type CoordinatorDepartureRow = Prisma.DepartureGetPayload<{
  include: {
    owner: { select: { name: true } }
  }
}>

function differenceInDays(later: string, earlier: string): number {
  return Math.round(
    (parseDateOnly(later).getTime() - parseDateOnly(earlier).getTime()) / 86_400_000,
  )
}

function timeHint(row: CoordinatorDepartureRow, today: string): string {
  const startDate = formatDateOnly(row.startDate)
  if (startDate === today) {
    return '今日出发'
  }
  if (startDate < today) {
    return '进行中'
  }
  return `${differenceInDays(startDate, today)} 天后出发`
}

function compareDepartures(
  left: CoordinatorDepartureRow,
  right: CoordinatorDepartureRow,
  today: string,
  dataGapsByDepartureId: ReadonlyMap<string, DepartureDataGap[]>,
): number {
  const leftStart = formatDateOnly(left.startDate)
  const rightStart = formatDateOnly(right.startDate)
  const leftGroup = leftStart === today ? 0 : leftStart < today ? 1 : 2
  const rightGroup = rightStart === today ? 0 : rightStart < today ? 1 : 2
  if (leftGroup !== rightGroup) {
    return leftGroup - rightGroup
  }

  const leftDate = leftGroup === 1 ? formatDateOnly(left.endDate) : leftStart
  const rightDate = rightGroup === 1 ? formatDateOnly(right.endDate) : rightStart
  if (leftDate !== rightDate) {
    return leftDate.localeCompare(rightDate)
  }

  const gapPriority =
    Number((dataGapsByDepartureId.get(right.id)?.length ?? 0) > 0)
    - Number((dataGapsByDepartureId.get(left.id)?.length ?? 0) > 0)
  return gapPriority || left.name.localeCompare(right.name, 'zh-CN')
}

function toItem(
  row: CoordinatorDepartureRow,
  today: string,
  dataGaps: DepartureDataGap[],
  pendingReceivableCount: number,
): WorkbenchCoordinatorDepartureItem {
  return {
    kind: 'coordinator-departure',
    id: row.id,
    title: row.name,
    href: `/departure/${row.id}`,
    ownerName: row.owner.name,
    startDate: formatDateOnly(row.startDate),
    endDate: formatDateOnly(row.endDate),
    timeHint: timeHint(row, today),
    status: row.status,
    dataGaps,
    pendingReceivableCount,
  }
}

@Injectable()
export class CoordinatorWorkbenchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly departureDataGapService: DepartureDataGapService,
  ) {}

  async buildModule(
    organizationId: string,
    asOf: Date,
    pendingPayableCount: number,
    pendingReceivableCountByDepartureId: ReadonlyMap<string, number>,
  ): Promise<WorkbenchModule> {
    const dates = getDepartureOperationalDates(asOf)
    const [rows, dataGapsByDepartureId] = await Promise.all([
      this.prisma.departure.findMany({
        where: {
          organizationId,
          ...buildDepartureOperationalWindowWhere('current_and_next_7_days', dates),
        },
        include: {
          owner: { select: { name: true } },
        },
      }),
      this.departureDataGapService.findByOrganization(organizationId),
    ])
    const sortedRows = [...rows].sort((left, right) =>
      compareDepartures(left, right, dates.today, dataGapsByDepartureId),
    )
    const inProgressCount = rows.filter(
      (row) =>
        formatDateOnly(row.startDate) <= dates.today
        && formatDateOnly(row.endDate) >= dates.today,
    ).length
    const nextSevenDaysCount = rows.length - inProgressCount
    const dataGapCount = rows.filter(
      (row) => (dataGapsByDepartureId.get(row.id)?.length ?? 0) > 0,
    ).length

    return {
      key: 'coordinator-departures',
      title: '近期发团',
      total: rows.length,
      href: '/departure?operationalWindow=current_and_next_7_days',
      metrics: [
        {
          key: 'in-progress',
          label: '进行中发团',
          value: inProgressCount,
          suffix: '个发团',
          href: '/departure?operationalWindow=in_progress',
        },
        {
          key: 'next-7-days',
          label: '未来 7 天发团',
          value: nextSevenDaysCount,
          suffix: '个发团',
          href: '/departure?operationalWindow=next_7_days',
        },
        {
          key: 'data-gaps',
          label: '资料待补充',
          value: dataGapCount,
          suffix: '个发团',
          href: '/departure?operationalWindow=current_and_next_7_days&departureDataGap=any',
        },
        {
          key: 'pending-payables',
          label: '待提交应付',
          value: pendingPayableCount,
          suffix: '个资源',
          href: '/departure?accountGenerationGap=payable',
        },
      ],
      items: sortedRows.slice(0, 8).map((row) =>
        toItem(
          row,
          dates.today,
          dataGapsByDepartureId.get(row.id) ?? [],
          pendingReceivableCountByDepartureId.get(row.id) ?? 0,
        ),
      ),
    }
  }
}
