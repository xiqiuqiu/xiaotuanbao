import { Injectable } from '@nestjs/common'
import type { WorkbenchCoordinatorTrendBucket, WorkbenchModule } from '@xiaotuanbao/shared'
import { DepartureStatus } from '@prisma/client'
import { PrismaService } from '../../database/prisma/prisma.service'
import { formatDateOnly, parseDateOnly } from '../departure/departure-date.utils'
import { DepartureDataGapService } from '../departure/departure-data-gap.service'
import {
  getDepartureOperationalDates,
  listInclusiveDateRange,
} from '../departure/departure-operational-window'

function trendDrillDownHref(date: string): string {
  return `/departure?startDateFrom=${date}&startDateTo=${date}&excludeClosed=1`
}

@Injectable()
export class CoordinatorTrendWorkbenchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly departureDataGapService: DepartureDataGapService,
  ) {}

  async buildModule(organizationId: string, asOf: Date): Promise<WorkbenchModule> {
    const dates = getDepartureOperationalDates(asOf)
    const bucketDates = listInclusiveDateRange(dates.tomorrow, dates.nextFourteenDaysEnd)
    const [rows, dataGapsByDepartureId] = await Promise.all([
      this.prisma.departure.findMany({
        where: {
          organizationId,
          status: { not: DepartureStatus.closed },
          startDate: {
            gte: parseDateOnly(dates.tomorrow),
            lte: parseDateOnly(dates.nextFourteenDaysEnd),
          },
        },
        select: {
          id: true,
          startDate: true,
          sourceOrders: { select: { guestCount: true } },
        },
      }),
      this.departureDataGapService.findByOrganization(organizationId),
    ])

    const aggregates = new Map<
      string,
      { departureCount: number; guestCount: number; dataGapDepartureCount: number }
    >()
    for (const date of bucketDates) {
      aggregates.set(date, { departureCount: 0, guestCount: 0, dataGapDepartureCount: 0 })
    }

    for (const row of rows) {
      const date = formatDateOnly(row.startDate)
      const bucket = aggregates.get(date)
      if (!bucket) {
        continue
      }
      bucket.departureCount += 1
      bucket.guestCount += row.sourceOrders.reduce((sum, order) => sum + order.guestCount, 0)
      if ((dataGapsByDepartureId.get(row.id)?.length ?? 0) > 0) {
        bucket.dataGapDepartureCount += 1
      }
    }

    const buckets: WorkbenchCoordinatorTrendBucket[] = bucketDates.map((date) => {
      const aggregate = aggregates.get(date)!
      return {
        date,
        departureCount: aggregate.departureCount,
        guestCount: aggregate.guestCount,
        dataGapDepartureCount: aggregate.dataGapDepartureCount,
        href: trendDrillDownHref(date),
      }
    })

    return {
      key: 'coordinator-trend',
      title: '未来团量与客流',
      description: '查看未来 14 天每日出发团数、客人人数与资料待补充发团数。',
      metrics: [],
      items: [],
      buckets,
    }
  }
}
