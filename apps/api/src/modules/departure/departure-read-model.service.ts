import { Injectable } from '@nestjs/common'
import type { DepartureCompletionTags } from '@xiaotuanbao/shared'
import { PrismaService } from '../../database/prisma/prisma.service'
import { VerificationService } from '../finance/verification.service'
import {
  buildDepartureReadModelAggregate,
  emptyDepartureReadModelAggregate,
  type DepartureReadModelAggregate,
  type ScheduleWithId,
  type SourceOrderAggregate,
  EMPTY_UNVERIFIED_CASH,
} from './departure-read-model.utils'

interface SegmentRollup {
  segmentCount: number
  resourceCount: number
  payableCents: number
}

@Injectable()
export class DepartureReadModelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly verificationService: VerificationService,
  ) {}

  async getForDeparture(departureId: string): Promise<DepartureReadModelAggregate> {
    const map = await this.batchGetForDepartures([departureId])
    return map.get(departureId) ?? emptyDepartureReadModelAggregate()
  }

  async batchGetForDepartures(
    departureIds: string[],
  ): Promise<Map<string, DepartureReadModelAggregate>> {
    const result = new Map<string, DepartureReadModelAggregate>()
    if (departureIds.length === 0) {
      return result
    }

    const uniqueIds = [...new Set(departureIds)]

    const [sourceOrderMap, segmentRollupMap, schedules, unverifiedCashByDeparture] =
      await Promise.all([
        this.batchSourceOrderAggregates(uniqueIds),
        this.batchSegmentRollups(uniqueIds),
        this.prisma.paymentSchedule.findMany({
          where: { departureId: { in: uniqueIds } },
          select: {
            id: true,
            departureId: true,
            direction: true,
            amountCents: true,
            cancelledAt: true,
          },
        }),
        this.verificationService.batchGetUnverifiedCashByDeparture(uniqueIds),
      ])

    const scheduleIds = schedules.map((schedule) => schedule.id)
    const settledByScheduleId = await this.verificationService.batchGetSettledAmounts(scheduleIds)

    const schedulesByDeparture = new Map<string, ScheduleWithId[]>()
    for (const schedule of schedules) {
      const list = schedulesByDeparture.get(schedule.departureId) ?? []
      list.push({
        id: schedule.id,
        direction: schedule.direction,
        amountCents: schedule.amountCents,
        cancelledAt: schedule.cancelledAt,
      })
      schedulesByDeparture.set(schedule.departureId, list)
    }

    for (const departureId of uniqueIds) {
      const sourceOrders = sourceOrderMap.get(departureId) ?? {
        count: 0,
        totalGuests: 0,
        grossReceivableCents: 0,
        discountCents: 0,
        netReceivableCents: 0,
      }
      const rollup = segmentRollupMap.get(departureId) ?? {
        segmentCount: 0,
        resourceCount: 0,
        payableCents: 0,
      }
      const departureSchedules = schedulesByDeparture.get(departureId) ?? []
      const unverifiedCash = unverifiedCashByDeparture.get(departureId) ?? EMPTY_UNVERIFIED_CASH

      result.set(
        departureId,
        buildDepartureReadModelAggregate({
          sourceOrders,
          segmentCount: rollup.segmentCount,
          resourceCount: rollup.resourceCount,
          payableCents: rollup.payableCents,
          schedules: departureSchedules,
          settledByScheduleId,
          unverifiedCash,
        }),
      )
    }

    return result
  }

  async batchGetOwnerNames(ownerUserIds: string[]): Promise<Map<string, string>> {
    const uniqueIds = [...new Set(ownerUserIds)]
    if (uniqueIds.length === 0) {
      return new Map()
    }

    const users = await this.prisma.user.findMany({
      where: { id: { in: uniqueIds }, deletedAt: null },
      select: { id: true, name: true },
    })

    return new Map(users.map((user) => [user.id, user.name]))
  }

  private async batchSourceOrderAggregates(
    departureIds: string[],
  ): Promise<Map<string, SourceOrderAggregate>> {
    const rows = await this.prisma.sourceOrder.groupBy({
      by: ['departureId'],
      where: { departureId: { in: departureIds } },
      _count: { id: true },
      _sum: {
        guestCount: true,
        grossReceivableCents: true,
        discountCents: true,
        netReceivableCents: true,
      },
    })

    const map = new Map<string, SourceOrderAggregate>()
    for (const row of rows) {
      map.set(row.departureId, {
        count: row._count.id,
        totalGuests: row._sum.guestCount ?? 0,
        grossReceivableCents: row._sum.grossReceivableCents ?? 0,
        discountCents: row._sum.discountCents ?? 0,
        netReceivableCents: row._sum.netReceivableCents ?? 0,
      })
    }
    return map
  }

  private async batchSegmentRollups(departureIds: string[]): Promise<Map<string, SegmentRollup>> {
    const segments = await this.prisma.itinerarySegment.findMany({
      where: { departureId: { in: departureIds } },
      select: {
        id: true,
        departureId: true,
        resources: {
          select: { amountCents: true },
        },
      },
    })

    const map = new Map<string, SegmentRollup>()
    for (const departureId of departureIds) {
      map.set(departureId, { segmentCount: 0, resourceCount: 0, payableCents: 0 })
    }

    for (const segment of segments) {
      const rollup = map.get(segment.departureId)!
      rollup.segmentCount += 1
      rollup.resourceCount += segment.resources.length
      rollup.payableCents += segment.resources.reduce((sum, resource) => sum + resource.amountCents, 0)
    }

    return map
  }
}

export type { DepartureReadModelAggregate, DepartureCompletionTags }
