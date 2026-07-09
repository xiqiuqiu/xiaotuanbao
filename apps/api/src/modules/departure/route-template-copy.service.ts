import { Injectable } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import type { RouteTemplateCopyFlags } from './dto/route-template.dto'
import { allocateSegmentDates } from './route-template-date.utils'
import { RouteTemplateService } from './route-template.service'

export interface CopyToDepartureParams {
  tx: Prisma.TransactionClient
  organizationId: string
  departureId: string
  departureStartDate: Date
  templateId: string
  flags?: RouteTemplateCopyFlags
}

@Injectable()
export class RouteTemplateCopyService {
  constructor(private readonly routeTemplateService: RouteTemplateService) {}

  async copyToDeparture(params: CopyToDepartureParams): Promise<void> {
    const {
      tx,
      organizationId,
      departureId,
      departureStartDate,
      templateId,
      flags = {},
    } = params

    const copySegments = flags.copySegments ?? true
    const copyResources = flags.copyResources ?? true
    const copyReferencePrices = flags.copyReferencePrices ?? true

    if (!copySegments) {
      return
    }

    const template = await this.routeTemplateService.findForCopy(organizationId, templateId)

    const dateRanges = allocateSegmentDates(
      departureStartDate,
      template.segments.map((segment) => segment.dayCount),
    )

    for (const [index, templateSegment] of template.segments.entries()) {
      const dateRange = dateRanges[index]

      const itinerarySegment = await tx.itinerarySegment.create({
        data: {
          departureId,
          name: templateSegment.name,
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
          dayCount: dateRange.dayCount,
          destination: templateSegment.destination,
          notes: templateSegment.notes,
          fromTemplate: true,
        },
      })

      if (!copyResources || templateSegment.resources.length === 0) {
        continue
      }

      await tx.segmentResource.createMany({
        data: templateSegment.resources.map((resource) => ({
          segmentId: itinerarySegment.id,
          resourceKind: resource.resourceKind,
          counterpartyType: resource.counterpartyType,
          partnerId: resource.partnerId,
          supplierId: resource.supplierId,
          title: resource.title,
          amountCents: copyReferencePrices ? resource.amountCents : 0,
          notes: resource.notes,
          fromTemplate: true,
        })),
      })
    }
  }
}
