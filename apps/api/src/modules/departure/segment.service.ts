import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import type {
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
import type { CreateItinerarySegmentDto, UpdateItinerarySegmentDto } from './dto/segment.dto'
import { formatDateOnly } from './departure-date.utils'
import { aggregatePayableOverview } from './segment-payable-overview.utils'
import {
  normalizeOptionalText,
  resolveSegmentDatePair,
  validateSegmentFields,
} from './segment.validation'

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
      this.toSegmentSummary(segment, payableStatusByResourceId),
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

    return this.toSegmentSummary(created, new Map())
  }

  async getById(organizationId: string, segmentId: string): Promise<ItinerarySegmentSummary> {
    const segment = await this.findSegmentOrThrow(organizationId, segmentId)
    const payableStatusByResourceId = await this.loadPayableStatusMap(
      organizationId,
      segment.resources.map((resource) => resource.id),
    )
    return this.toSegmentSummary(segment, payableStatusByResourceId)
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
    return this.toSegmentSummary(updated, payableStatusByResourceId)
  }

  async remove(organizationId: string, segmentId: string): Promise<void> {
    const segment = await this.findSegmentOrThrow(organizationId, segmentId)
    this.ensureDepartureEditable(segment.departure)

    if (segment.resources.length > 0) {
      throw new ConflictException('当前行程段已有资源，不能删除')
    }

    await this.prisma.itinerarySegment.delete({ where: { id: segment.id } })
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
      throw new NotFoundException('行程段不存在')
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

  private toSegmentSummary(
    segment: SegmentWithResources,
    payableStatusByResourceId: Map<string, SegmentPayableStatus>,
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
      resourceCount,
      outsourceCount,
      resourceAmountCents,
      payableStatus: aggregatePayableOverview(payableStatuses),
    }
  }
}
