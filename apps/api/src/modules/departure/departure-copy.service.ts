import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import {
  CounterpartyType,
  type Prisma,
  type SegmentResource,
} from '@prisma/client'
import {
  buildOutOfRangeItinerarySegmentConflict,
  formatOutOfRangeItinerarySegmentSummary,
  listOutOfRangeItinerarySegments,
} from '@xiaotuanbao/shared'
import { PrismaService } from '../../database/prisma/prisma.service'
import { formatDateOnly } from './departure-date.utils'
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
  targetEndDate: Date
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
          orderBy: { sortOrder: 'asc' },
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
      targetEndDate,
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
    this.assertCopiedSegmentsFitTourPeriod(segments, dateRanges, targetStartDate, targetEndDate)

    for (const [index, sourceSegment] of segments.entries()) {
      const dateRange = dateRanges[index]

      const itinerarySegment = await tx.itinerarySegment.create({
        data: {
          departureId: targetDepartureId,
          name: sourceSegment.name,
          sortOrder: sourceSegment.sortOrder,
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
          dayCount: dateRange.dayCount,
          destination: sourceSegment.destination,
          notes: sourceSegment.notes,
          pendingCheck: true,
        },
      })

      if (sourceSegment.resources.length === 0) {
        continue
      }

      await tx.segmentResource.createMany({
        data: sourceSegment.resources.map((resource) =>
          toCopiedSegmentResource(itinerarySegment.id, resource),
        ),
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

    const templateSegments = segments.map((segment) => ({
      sortOrder: segment.sortOrder,
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

  private assertCopiedSegmentsFitTourPeriod(
    segments: Array<{ id: string; name: string }>,
    dateRanges: Array<{ startDate: Date | null; endDate: Date | null }>,
    targetStartDate: Date,
    targetEndDate: Date,
  ) {
    const periodStartDate = formatDateOnly(targetStartDate)
    const periodEndDate = formatDateOnly(targetEndDate)
    const proposed = segments.map((segment, index) => {
      const range = dateRanges[index]
      return {
        id: segment.id,
        name: segment.name,
        startDate: range.startDate ? formatDateOnly(range.startDate) : null,
        endDate: range.endDate ? formatDateOnly(range.endDate) : null,
      }
    })
    const outOfRange = listOutOfRangeItinerarySegments(
      periodStartDate,
      periodEndDate,
      proposed,
    )
    if (outOfRange.length === 0) {
      return
    }

    const conflict = buildOutOfRangeItinerarySegmentConflict(
      periodStartDate,
      periodEndDate,
      outOfRange,
    )
    throw new BadRequestException({
      message: formatOutOfRangeItinerarySegmentSummary(conflict).replace(
        '保存被拒绝',
        '复制被拒绝',
      ),
      data: conflict,
    })
  }
}

function toCopiedSegmentResource(
  segmentId: string,
  resource: Pick<
    SegmentResource,
    'resourceKind' | 'title' | 'notes'
  >,
) {
  return {
    segmentId,
    resourceKind: resource.resourceKind,
    counterpartyType: CounterpartyType.supplier,
    partnerId: null,
    supplierId: null,
    title: resource.title,
    amountCents: 0,
    notes: resource.notes,
    pendingCheck: true,
  }
}
