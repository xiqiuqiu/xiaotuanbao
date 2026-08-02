import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import type {
  GenerateDailySegmentsDto,
  GenerateDailySegmentsMode,
  GenerateDailySegmentsResult,
  ItinerarySegmentListResult,
  ItinerarySegmentSummary,
} from '@xiaotuanbao/shared'
import { ResourceKind, SegmentPayableStatus } from '@xiaotuanbao/shared'
import {
  type Departure,
  type ItinerarySegment,
  type SegmentResource,
} from '@prisma/client'
import { PrismaService } from '../../database/prisma/prisma.service'
import { DepartureFinanceFacade } from '../finance/departure-finance-facade.service'
import {
  enumerateDateOnlyDays,
  segmentCoversDay,
} from './daily-segment-skeleton.utils'
import { normalizeSegmentSortOrderInTx } from './daily-segment-skeleton.write'
import type { CreateItinerarySegmentDto, UpdateItinerarySegmentDto } from './dto/segment.dto'
import { formatDateOnly, parseDateOnly } from './departure-date.utils'
import { aggregatePayableOverview, countPayableGenerated } from './segment-payable-overview.utils'
import {
  normalizeOptionalText,
  resolveSegmentDatePair,
  validateSegmentFields,
} from './segment.validation'
import { hasTicketHeadcountMismatch } from './ticket-type-headcount.utils'

type SegmentWithResources = ItinerarySegment & {
  resources: Pick<SegmentResource, 'id' | 'amountCents' | 'resourceKind'>[]
}

@Injectable()
export class SegmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly departureFinanceFacade: DepartureFinanceFacade,
  ) {}

  async listByDeparture(
    organizationId: string,
    departureId: string,
  ): Promise<ItinerarySegmentListResult> {
    const departure = await this.findDepartureOrThrow(organizationId, departureId)
    const sourceGuestTotal = await this.sumSourceGuestTotal(departure.id)

    const segments = await this.prisma.itinerarySegment.findMany({
      where: { departureId: departure.id },
      include: {
        resources: {
          select: {
            id: true,
            amountCents: true,
            resourceKind: true,
          },
        },
      },
      orderBy: [{ sortOrder: 'asc' }],
    })

    const resourceIds = segments.flatMap((segment) =>
      segment.resources.map((resource) => resource.id),
    )
    const payableStatusByResourceId = await this.loadPayableStatusMap(
      organizationId,
      resourceIds,
    )

    const items = segments.map((segment) =>
      this.toSegmentSummary(segment, payableStatusByResourceId, sourceGuestTotal),
    )

    return {
      items,
      total: items.length,
      summary: {
        segmentCount: items.length,
        totalDays: items.reduce((sum, item) => sum + (item.dayCount ?? 0), 0),
        resourceCount: items.reduce((sum, item) => sum + item.resourceCount, 0),
        payableOverview: aggregatePayableOverview(
          resourceIds.map(
            (resourceId) =>
              payableStatusByResourceId.get(resourceId) ??
              SegmentPayableStatus.NOT_GENERATED,
          ),
        ),
      },
    }
  }

  async create(
    organizationId: string,
    departureId: string,
    dto: CreateItinerarySegmentDto,
  ): Promise<ItinerarySegmentSummary> {
    const departure = await this.findDepartureOrThrow(organizationId, departureId)
    this.ensureDepartureEditable(departure)

    const name = dto.name.trim()
    validateSegmentFields({ name })

    const dates = resolveSegmentDatePair({
      startDate: dto.startDate,
      endDate: dto.endDate,
      departureStartDate: departure.startDate,
      departureEndDate: departure.endDate,
      mode: 'create',
    })

    if (dates.kind === 'keep') {
      throw new Error('unreachable: create date resolve returned keep')
    }

    const maxSort = await this.prisma.itinerarySegment.aggregate({
      where: { departureId: departure.id },
      _max: { sortOrder: true },
    })
    const sortOrder = (maxSort._max.sortOrder ?? -1) + 1

    const destination = normalizeOptionalText(dto.destination) ?? null
    const ticketCounts = {
      fullTicketCount: dto.fullTicketCount ?? 0,
      halfTicketCount: dto.halfTicketCount ?? 0,
      studentTicketCount: dto.studentTicketCount ?? 0,
      freeTicketCount: dto.freeTicketCount ?? 0,
    }

    const created = await this.prisma.itinerarySegment.create({
      data: {
        departureId: departure.id,
        name,
        sortOrder,
        startDate: dates.startDate,
        endDate: dates.endDate,
        dayCount: dates.dayCount,
        destination,
        notes: dto.notes?.trim() || null,
        ...ticketCounts,
      },
      include: {
        resources: {
          select: {
            id: true,
            amountCents: true,
            resourceKind: true,
          },
        },
      },
    })

    const sourceGuestTotal = await this.sumSourceGuestTotal(departure.id)
    return this.toSegmentSummary(created, new Map(), sourceGuestTotal)
  }

  async getById(organizationId: string, segmentId: string): Promise<ItinerarySegmentSummary> {
    const segment = await this.findSegmentOrThrow(organizationId, segmentId)
    const payableStatusByResourceId = await this.loadPayableStatusMap(
      organizationId,
      segment.resources.map((resource) => resource.id),
    )
    const sourceGuestTotal = await this.sumSourceGuestTotal(segment.departureId)
    return this.toSegmentSummary(segment, payableStatusByResourceId, sourceGuestTotal)
  }

  async update(
    organizationId: string,
    segmentId: string,
    dto: UpdateItinerarySegmentDto,
  ): Promise<ItinerarySegmentSummary> {
    const segment = await this.findSegmentOrThrow(organizationId, segmentId)
    this.ensureDepartureEditable(segment.departure)

    validateSegmentFields({
      name: dto.name,
    })

    const dates = resolveSegmentDatePair({
      startDate: dto.startDate,
      endDate: dto.endDate,
      departureStartDate: segment.departure.startDate,
      departureEndDate: segment.departure.endDate,
      existing: {
        startDate: segment.startDate,
        endDate: segment.endDate,
        dayCount: segment.dayCount,
      },
      mode: 'update',
    })

    const destination = normalizeOptionalText(dto.destination)

    const updated = await this.prisma.itinerarySegment.update({
      where: { id: segment.id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dates.kind === 'empty'
          ? { startDate: null, endDate: null, dayCount: null }
          : dates.kind === 'set'
            ? {
                startDate: dates.startDate,
                endDate: dates.endDate,
                dayCount: dates.dayCount,
              }
            : {}),
        ...(destination !== undefined ? { destination } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes?.trim() || null } : {}),
        ...(dto.fullTicketCount !== undefined
          ? { fullTicketCount: dto.fullTicketCount }
          : {}),
        ...(dto.halfTicketCount !== undefined
          ? { halfTicketCount: dto.halfTicketCount }
          : {}),
        ...(dto.studentTicketCount !== undefined
          ? { studentTicketCount: dto.studentTicketCount }
          : {}),
        ...(dto.freeTicketCount !== undefined
          ? { freeTicketCount: dto.freeTicketCount }
          : {}),
        pendingCheck: false,
      },
      include: {
        resources: {
          select: {
            id: true,
            amountCents: true,
            resourceKind: true,
          },
        },
      },
    })

    const payableStatusByResourceId = await this.loadPayableStatusMap(
      organizationId,
      updated.resources.map((resource) => resource.id),
    )
    const sourceGuestTotal = await this.sumSourceGuestTotal(updated.departureId)
    return this.toSegmentSummary(updated, payableStatusByResourceId, sourceGuestTotal)
  }

  async remove(organizationId: string, segmentId: string): Promise<void> {
    const segment = await this.findSegmentOrThrow(organizationId, segmentId)
    this.ensureDepartureEditable(segment.departure)

    if (segment.resources.length > 0) {
      throw new ConflictException('当前行程已有资源，不能删除')
    }

    const siblingCount = await this.prisma.itinerarySegment.count({
      where: { departureId: segment.departureId },
    })
    if (siblingCount <= 1) {
      throw new ConflictException('发团至少保留一天行程，不能清空')
    }

    await this.prisma.itinerarySegment.delete({ where: { id: segment.id } })
  }

  /**
   * 按发团出团日～回团日一键生成一日一段骨架。
   * fill_missing：仅补未被任何已有段覆盖的日期；rebuild_empty：先删无资源空段再补日。
   * 已有资源的段始终保留，不静默覆盖。
   */
  async generateDaily(
    organizationId: string,
    departureId: string,
    dto: GenerateDailySegmentsDto = {},
  ): Promise<GenerateDailySegmentsResult> {
    const mode: GenerateDailySegmentsMode = dto.mode ?? 'fill_missing'
    const departure = await this.findDepartureOrThrow(organizationId, departureId)
    this.ensureDepartureEditable(departure)

    const days = enumerateDateOnlyDays(departure.startDate, departure.endDate)

    return this.prisma.$transaction(async (tx) => {
      const segments = await tx.itinerarySegment.findMany({
        where: { departureId: departure.id },
        include: {
          resources: { select: { id: true } },
        },
      })

      const preservedWithResources = segments.filter((segment) => segment.resources.length > 0).length
      let working = segments
      let removedCount = 0

      if (mode === 'rebuild_empty') {
        const emptyIds = segments
          .filter((segment) => segment.resources.length === 0)
          .map((segment) => segment.id)
        if (emptyIds.length > 0) {
          await tx.itinerarySegment.deleteMany({ where: { id: { in: emptyIds } } })
          removedCount = emptyIds.length
        }
        working = segments.filter((segment) => segment.resources.length > 0)
      }

      const missingDays = days.filter(
        (day) => !working.some((segment) => segmentCoversDay(segment, day)),
      )

      if (missingDays.length > 0) {
        // createMany via shared helper would re-query; keep inline after rebuild_empty working set.
        await tx.itinerarySegment.createMany({
          data: missingDays.map((day) => {
            const dayIndex = days.indexOf(day)
            return {
              departureId: departure.id,
              name: `第${dayIndex + 1}天`,
              startDate: parseDateOnly(day),
              endDate: parseDateOnly(day),
              dayCount: 1,
              sortOrder: dayIndex,
              destination: null,
              notes: null,
            }
          }),
        })
      }

      await normalizeSegmentSortOrderInTx(tx, departure.id)

      return {
        mode,
        dayCount: days.length,
        createdCount: missingDays.length,
        removedCount,
        preservedWithResources,
      }
    })
  }

  private async findDepartureOrThrow(organizationId: string, departureId: string) {
    const departure = await this.prisma.departure.findFirst({
      where: { id: departureId, organizationId },
    })

    if (!departure) {
      throw new NotFoundException('发团不存在')
    }

    return departure
  }

  private async findSegmentOrThrow(organizationId: string, segmentId: string) {
    const segment = await this.prisma.itinerarySegment.findFirst({
      where: {
        id: segmentId,
        departure: { organizationId },
      },
      include: {
        departure: true,
        resources: {
          select: {
            id: true,
            amountCents: true,
            resourceKind: true,
          },
        },
      },
    })

    if (!segment) {
      throw new NotFoundException('行程不存在')
    }

    return segment
  }

  private ensureDepartureEditable(departure: Departure) {
    this.departureFinanceFacade.assertMutable(departure, '编辑')
  }

  private async loadPayableStatusMap(
    organizationId: string,
    resourceIds: string[],
  ): Promise<Map<string, SegmentPayableStatus>> {
    const states = await this.departureFinanceFacade.getSegmentResourceFinanceStates(
      organizationId,
      resourceIds,
    )
    const map = new Map<string, SegmentPayableStatus>()
    for (const [resourceId, state] of states) {
      map.set(resourceId, state.payableStatus)
    }
    return map
  }

  private async sumSourceGuestTotal(departureId: string): Promise<number> {
    const aggregate = await this.prisma.sourceOrder.aggregate({
      where: { departureId },
      _sum: { guestCount: true },
    })
    return aggregate._sum.guestCount ?? 0
  }

  private toSegmentSummary(
    segment: SegmentWithResources,
    payableStatusByResourceId: Map<string, SegmentPayableStatus>,
    sourceGuestTotal: number,
  ): ItinerarySegmentSummary {
    const resourceCount = segment.resources.length
    const outsourceCount = segment.resources.filter(
      (resource) => resource.resourceKind === ResourceKind.OUTSOURCE,
    ).length
    const resourceAmountCents = segment.resources.reduce(
      (sum, resource) => sum + resource.amountCents,
      0,
    )
    const payableStatuses = segment.resources.map(
      (resource) =>
        payableStatusByResourceId.get(resource.id) ?? SegmentPayableStatus.NOT_GENERATED,
    )
    const ticketCounts = {
      fullTicketCount: segment.fullTicketCount,
      halfTicketCount: segment.halfTicketCount,
      studentTicketCount: segment.studentTicketCount,
      freeTicketCount: segment.freeTicketCount,
    }

    return {
      id: segment.id,
      departureId: segment.departureId,
      name: segment.name,
      sortOrder: segment.sortOrder,
      startDate: segment.startDate ? formatDateOnly(segment.startDate) : null,
      endDate: segment.endDate ? formatDateOnly(segment.endDate) : null,
      dayCount: segment.dayCount,
      destination: segment.destination,
      notes: segment.notes,
      ...ticketCounts,
      hasTicketHeadcountMismatch: hasTicketHeadcountMismatch(ticketCounts, sourceGuestTotal),
      pendingCheck: segment.pendingCheck,
      resourceCount,
      outsourceCount,
      resourceAmountCents,
      payableGeneratedCount: countPayableGenerated(payableStatuses),
      payableStatus: aggregatePayableOverview(payableStatuses),
    }
  }
}
