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
  DepartureStatus,
  type Departure,
  type ItinerarySegment,
  type SegmentResource,
} from '@prisma/client'
import { PrismaService } from '../../database/prisma/prisma.service'
import type { CreateItinerarySegmentDto, UpdateItinerarySegmentDto } from './dto/segment.dto'
import {
  computeDayCount,
  formatDateOnly,
  parseDateOnly,
} from './departure-date.utils'
import { validateSegmentDates, validateSegmentFields } from './segment.validation'

type SegmentWithResources = ItinerarySegment & {
  resources: Pick<SegmentResource, 'amountCents' | 'resourceKind'>[]
}

@Injectable()
export class SegmentService {
  constructor(private readonly prisma: PrismaService) {}

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
            amountCents: true,
            resourceKind: true,
          },
        },
      },
      orderBy: [{ startDate: 'asc' }],
    })

    const items = segments.map((segment) => this.toSegmentSummary(segment))

    return {
      items,
      total: items.length,
      summary: {
        segmentCount: items.length,
        totalDays: items.reduce((sum, item) => sum + item.dayCount, 0),
        resourceCount: items.reduce((sum, item) => sum + item.resourceCount, 0),
        payableOverview: SegmentPayableStatus.NOT_GENERATED,
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
    const destination = dto.destination.trim()
    validateSegmentFields({ name, destination, applicableGuestCount: dto.applicableGuestCount })

    const startDate = parseDateOnly(dto.startDate)
    const endDate = parseDateOnly(dto.endDate)
    validateSegmentDates({
      startDate,
      endDate,
      departureStartDate: departure.startDate,
      departureEndDate: departure.endDate,
    })

    const applicableGuestCount =
      dto.applicableGuestCount ?? (await this.resolveDefaultApplicableGuestCount(departure.id))

    const created = await this.prisma.itinerarySegment.create({
      data: {
        departureId: departure.id,
        name,
        startDate,
        endDate,
        dayCount: computeDayCount(startDate, endDate),
        destination,
        applicableGuestCount,
        notes: dto.notes?.trim() || null,
        fromTemplate: false,
      },
      include: {
        resources: {
          select: {
            amountCents: true,
            resourceKind: true,
          },
        },
      },
    })

    return this.toSegmentSummary(created)
  }

  async getById(organizationId: string, segmentId: string): Promise<ItinerarySegmentSummary> {
    const segment = await this.findSegmentOrThrow(organizationId, segmentId)
    return this.toSegmentSummary(segment)
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
      destination: dto.destination,
      applicableGuestCount: dto.applicableGuestCount,
    })

    const startDate = dto.startDate ? parseDateOnly(dto.startDate) : segment.startDate
    const endDate = dto.endDate ? parseDateOnly(dto.endDate) : segment.endDate
    validateSegmentDates({
      startDate,
      endDate,
      departureStartDate: segment.departure.startDate,
      departureEndDate: segment.departure.endDate,
    })

    const updated = await this.prisma.itinerarySegment.update({
      where: { id: segment.id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.startDate !== undefined ? { startDate } : {}),
        ...(dto.endDate !== undefined ? { endDate } : {}),
        ...(dto.startDate !== undefined || dto.endDate !== undefined
          ? { dayCount: computeDayCount(startDate, endDate) }
          : {}),
        ...(dto.destination !== undefined ? { destination: dto.destination.trim() } : {}),
        ...(dto.applicableGuestCount !== undefined
          ? { applicableGuestCount: dto.applicableGuestCount }
          : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes?.trim() || null } : {}),
      },
      include: {
        resources: {
          select: {
            amountCents: true,
            resourceKind: true,
          },
        },
      },
    })

    return this.toSegmentSummary(updated)
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

  private async resolveDefaultApplicableGuestCount(departureId: string): Promise<number> {
    const aggregate = await this.prisma.sourceOrder.aggregate({
      where: { departureId },
      _sum: { guestCount: true },
    })

    const totalGuests = aggregate._sum.guestCount ?? 0
    return totalGuests > 0 ? totalGuests : 1
  }

  private ensureDepartureEditable(departure: Departure) {
    if (departure.status === DepartureStatus.closed) {
      throw new ConflictException('发团已关闭，不可编辑')
    }
  }

  private toSegmentSummary(segment: SegmentWithResources): ItinerarySegmentSummary {
    const resourceCount = segment.resources.length
    const outsourceCount = segment.resources.filter(
      (resource) => resource.resourceKind === ResourceKind.OUTSOURCE,
    ).length
    const resourceAmountCents = segment.resources.reduce(
      (sum, resource) => sum + resource.amountCents,
      0,
    )

    return {
      id: segment.id,
      departureId: segment.departureId,
      name: segment.name,
      startDate: formatDateOnly(segment.startDate),
      endDate: formatDateOnly(segment.endDate),
      dayCount: segment.dayCount,
      destination: segment.destination,
      applicableGuestCount: segment.applicableGuestCount,
      notes: segment.notes,
      fromTemplate: segment.fromTemplate,
      resourceCount,
      outsourceCount,
      resourceAmountCents,
      payableStatus: SegmentPayableStatus.NOT_GENERATED,
    }
  }
}
