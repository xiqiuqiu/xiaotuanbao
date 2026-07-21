import { Injectable } from '@nestjs/common'
import type { WorkbenchModule, WorkbenchOrganizationScaleBucket } from '@xiaotuanbao/shared'
import { PrismaService } from '../../database/prisma/prisma.service'
import { formatDateOnly, parseDateOnly } from '../departure/departure-date.utils'
import { listRecentCalendarMonths } from '../departure/departure-operational-window'

function monthDrillDownHref(monthStart: string, monthEnd: string): string {
  return `/departure?startDateFrom=${monthStart}&startDateTo=${monthEnd}`
}

@Injectable()
export class OrganizationScaleWorkbenchService {
  constructor(private readonly prisma: PrismaService) {}

  async buildModule(organizationId: string, asOf: Date): Promise<WorkbenchModule> {
    const months = listRecentCalendarMonths(asOf, 6)
    const rangeStart = months[0]!.start
    const rangeEnd = months[months.length - 1]!.end
    const currentMonth = months[months.length - 1]!

    const rows = await this.prisma.departure.findMany({
      where: {
        organizationId,
        startDate: {
          gte: parseDateOnly(rangeStart),
          lte: parseDateOnly(rangeEnd),
        },
      },
      select: {
        startDate: true,
        sourceOrders: { select: { guestCount: true } },
      },
    })

    const aggregates = new Map<string, { departureCount: number; guestCount: number }>()
    for (const month of months) {
      aggregates.set(month.month, { departureCount: 0, guestCount: 0 })
    }

    for (const row of rows) {
      const startDate = formatDateOnly(row.startDate)
      const monthKey = startDate.slice(0, 7)
      const bucket = aggregates.get(monthKey)
      if (!bucket) {
        continue
      }
      bucket.departureCount += 1
      bucket.guestCount += row.sourceOrders.reduce(
        (sum: number, order: { guestCount: number }) => sum + order.guestCount,
        0,
      )
    }

    const buckets: WorkbenchOrganizationScaleBucket[] = months.map((month) => {
      const aggregate = aggregates.get(month.month)!
      return {
        month: month.month,
        monthStart: month.start,
        monthEnd: month.end,
        departureCount: aggregate.departureCount,
        guestCount: aggregate.guestCount,
        inProgress: month.month === currentMonth.month,
        href: monthDrillDownHref(month.start, month.end),
      }
    })

    const current = buckets[buckets.length - 1]!

    return {
      key: 'organization-scale',
      title: '业务规模与趋势',
      metrics: [
        {
          key: 'month-departures',
          label: '本月发团数',
          value: current.departureCount,
          suffix: '个发团',
          href: current.href,
        },
        {
          key: 'month-guests',
          label: '本月客源人次',
          value: current.guestCount,
          suffix: '人次',
          href: current.href,
        },
      ],
      items: [],
      buckets,
    }
  }
}
