import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { PrismaService } from '../../database/prisma/prisma.service'
import type { CreateRouteTemplateFromDepartureDto } from './dto/route-template.dto'
import { allocateSegmentDates } from './route-template-date.utils'
import type { RouteTemplateDetailSummary } from './route-template.service'
import { RouteTemplateService } from './route-template.service'

export interface CopyFromDepartureParams {
  tx: Prisma.TransactionClient
  organizationId: string
  sourceDepartureId: string
  targetDepartureId: string
  targetStartDate: Date
}

@Injectable()
export class DepartureCopyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly routeTemplateService: RouteTemplateService,
  ) {}

  async findForCopy(organizationId: string, departureId: string) {
    const departure = await this.prisma.departure.findFirst({
      where: { id: departureId, organizationId },
      include: {
        itinerarySegments: {
          orderBy: { startDate: 'asc' },
          include: { resources: true },
        },
      },
    })

    if (!departure) {
      throw new NotFoundException('发团不存在')
    }

    return departure
  }

  async copyToDeparture(params: CopyFromDepartureParams): Promise<void> {
    const {
      tx,
      organizationId,
      sourceDepartureId,
      targetDepartureId,
      targetStartDate,
    } = params

    const sourceDeparture = await this.findForCopy(organizationId, sourceDepartureId)
    const segments = sourceDeparture.itinerarySegments

    if (segments.length === 0) {
      return
    }

    const dateRanges = allocateSegmentDates(
      targetStartDate,
      segments.map((segment) => segment.dayCount),
    )

    for (const [index, sourceSegment] of segments.entries()) {
      const dateRange = dateRanges[index]

      const itinerarySegment = await tx.itinerarySegment.create({
        data: {
          departureId: targetDepartureId,
          name: sourceSegment.name,
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
          dayCount: dateRange.dayCount,
          destination: sourceSegment.destination,
          notes: sourceSegment.notes,
        },
      })

      if (sourceSegment.resources.length === 0) {
        continue
      }

      await tx.segmentResource.createMany({
        data: sourceSegment.resources.map((resource) => ({
          segmentId: itinerarySegment.id,
          resourceKind: resource.resourceKind,
          counterpartyType: resource.counterpartyType,
          partnerId: resource.partnerId,
          supplierId: resource.supplierId,
          title: resource.title,
          amountCents: 0,
          notes: resource.notes,
        })),
      })
    }
  }

  async copyToTemplate(
    organizationId: string,
    departureId: string,
    dto: CreateRouteTemplateFromDepartureDto,
  ): Promise<RouteTemplateDetailSummary> {
    const sourceDeparture = await this.findForCopy(organizationId, departureId)
    const segments = sourceDeparture.itinerarySegments

    if (segments.length === 0) {
      throw new BadRequestException('当前发团没有行程段，无法保存为常用路线')
    }

    const templateSegments = segments.map((segment, sortOrder) => ({
      sortOrder,
      name: segment.name,
      dayCount: segment.dayCount,
      destination: segment.destination ?? undefined,
      notes: segment.notes ?? undefined,
      resources:
        segment.resources.length > 0
          ? segment.resources.map((resource) => ({
              resourceKind: resource.resourceKind,
              counterpartyType: resource.counterpartyType,
              partnerId: resource.partnerId ?? undefined,
              supplierId: resource.supplierId ?? undefined,
              title: resource.title,
              amountCents: 0,
              notes: resource.notes ?? undefined,
            }))
          : undefined,
    }))

    return this.routeTemplateService.create(organizationId, {
      name: dto.name.trim(),
      defaultDayCount: dto.defaultDayCount,
      segments: templateSegments,
    })
  }
}
