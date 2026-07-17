import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import {
  RESOURCE_KIND_LABELS,
  SegmentPayableStatus,
  type BatchFinanceGenerationItem,
  type BatchFinanceGenerationResult,
  type GeneratePayableResult,
  type ResourceKind as SharedResourceKind,
  type SegmentResourceListResult,
  type SegmentResourceSummary,
} from '@xiaotuanbao/shared'
import {
  DirectoryProfileStatus,
  PaymentScheduleDirection,
  ResourceKind,
  type Departure,
  type ItinerarySegment,
  type Partner,
  type SegmentResource,
  type Supplier,
} from '@prisma/client'
import { PrismaService } from '../../database/prisma/prisma.service'
import { DepartureFinanceFacade } from '../finance/departure-finance-facade.service'
import type {
  CreateSegmentResourceDto,
  ListSegmentResourcesQueryDto,
  UpdateSegmentResourceDto,
} from './dto/segment-resource.dto'
import { DepartureFinanceBridgeService } from './departure-finance-bridge.service'
import type { SegmentResourceFinanceState } from '../finance/departure-finance-facade.service'
import { resolveSegmentResourceCounterparty } from './segment-resource.validation'
import {
  httpExceptionMessage,
  isAlreadyGeneratedConflict,
  summarizeBatchFinanceGeneration,
} from './batch-finance-generation.utils'

type SegmentResourceWithRelations = SegmentResource & {
  partner: Partner | null
  supplier: Supplier | null
  segment: ItinerarySegment & { departure: Departure }
}

@Injectable()
export class SegmentResourceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly financeBridge: DepartureFinanceBridgeService,
    private readonly departureFinanceFacade: DepartureFinanceFacade,
  ) {}

  async listBySegment(
    organizationId: string,
    segmentId: string,
    query: ListSegmentResourcesQueryDto,
  ): Promise<SegmentResourceListResult> {
    const segment = await this.findSegmentOrThrow(organizationId, segmentId)
    const keyword = query.keyword?.trim()

    const resources = await this.prisma.segmentResource.findMany({
      where: {
        segmentId: segment.id,
        ...(query.resourceKind ? { resourceKind: query.resourceKind } : {}),
        ...(keyword
          ? {
              OR: [
                { title: { contains: keyword, mode: 'insensitive' } },
                { notes: { contains: keyword, mode: 'insensitive' } },
                { partner: { name: { contains: keyword, mode: 'insensitive' } } },
                { supplier: { name: { contains: keyword, mode: 'insensitive' } } },
              ],
            }
          : {}),
      },
      include: {
        partner: true,
        supplier: true,
        segment: { include: { departure: true } },
      },
      orderBy: [{ id: 'asc' }],
    })

    const metaMap = await this.departureFinanceFacade.getSegmentResourceFinanceStates(
      organizationId,
      resources.map((resource) => resource.id),
      new Map(resources.map((resource) => [resource.id, resource.amountCents])),
    )

    let items = resources.map((resource) =>
      this.toResourceSummary(resource, metaMap.get(resource.id)),
    )

    if (query.payableStatus) {
      items = items.filter((item) => item.payableStatus === query.payableStatus)
    }

    return {
      items,
      total: items.length,
    }
  }

  async create(
    organizationId: string,
    segmentId: string,
    dto: CreateSegmentResourceDto,
  ): Promise<SegmentResourceSummary> {
    const segment = await this.findSegmentOrThrow(organizationId, segmentId)
    this.ensureDepartureEditable(segment.departure)

    const counterparty = resolveSegmentResourceCounterparty({
      resourceKind: dto.resourceKind,
      partnerId: dto.partnerId,
      supplierId: dto.supplierId,
    })

    if (dto.resourceKind === ResourceKind.outsource) {
      await this.ensureSelectablePartner(organizationId, counterparty.partnerId!)
    } else {
      await this.ensureSelectableSupplier(
        organizationId,
        counterparty.supplierId!,
        dto.resourceKind,
      )
    }

    const created = await this.prisma.segmentResource.create({
      data: {
        segmentId: segment.id,
        resourceKind: dto.resourceKind,
        counterpartyType: counterparty.counterpartyType,
        partnerId: counterparty.partnerId,
        supplierId: counterparty.supplierId,
        title: dto.title?.trim() || '',
        amountCents: dto.amountCents,
        notes: dto.notes?.trim() || null,
      },
      include: {
        partner: true,
        supplier: true,
        segment: { include: { departure: true } },
      },
    })

    return this.toResourceSummary(created, {
      hasSchedule: false,
      paymentScheduleId: null,
      financeTouched: false,
      payableStatus: SegmentPayableStatus.NOT_GENERATED,
      hasSourceAmountMismatch: false,
      amountFieldsLocked: false,
      agreedAmountCents: created.amountCents,
      scheduleAmountCents: null,
      paidCents: null,
      unpaidCents: null,
      needsReview: false,
    })
  }

  async getById(organizationId: string, resourceId: string): Promise<SegmentResourceSummary> {
    const resource = await this.findResourceOrThrow(organizationId, resourceId)
    const meta = await this.departureFinanceFacade.getSegmentResourceFinanceState(
      organizationId,
      resource.id,
      resource,
    )
    return this.toResourceSummary(resource, meta)
  }

  async update(
    organizationId: string,
    resourceId: string,
    dto: UpdateSegmentResourceDto,
  ): Promise<SegmentResourceSummary> {
    const resource = await this.findResourceOrThrow(organizationId, resourceId)
    this.ensureDepartureEditable(resource.segment.departure)

    const resourceKind = dto.resourceKind ?? resource.resourceKind
    const partnerId =
      dto.partnerId !== undefined ? dto.partnerId : resource.partnerId ?? undefined
    const supplierId =
      dto.supplierId !== undefined ? dto.supplierId : resource.supplierId ?? undefined

    const counterparty = resolveSegmentResourceCounterparty({
      resourceKind,
      partnerId,
      supplierId,
    })

    if (resourceKind === ResourceKind.outsource) {
      await this.ensureSelectablePartner(organizationId, counterparty.partnerId!)
    } else {
      await this.ensureSelectableSupplier(
        organizationId,
        counterparty.supplierId!,
        resourceKind,
      )
    }

    const nextAmountCents = dto.amountCents ?? resource.amountCents
    await this.financeBridge.assertResourceAmountEditable(
      organizationId,
      resource.id,
      resource.amountCents,
      nextAmountCents,
    )

    const updated = await this.prisma.segmentResource.update({
      where: { id: resource.id },
      data: {
        ...(dto.resourceKind !== undefined ? { resourceKind } : {}),
        counterpartyType: counterparty.counterpartyType,
        partnerId: counterparty.partnerId,
        supplierId: counterparty.supplierId,
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.amountCents !== undefined ? { amountCents: dto.amountCents } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes?.trim() || null } : {}),
      },
      include: {
        partner: true,
        supplier: true,
        segment: { include: { departure: true } },
      },
    })

    const financeMeta = await this.financeBridge.syncSegmentResourceSchedule(
      organizationId,
      updated,
    )
    return this.toResourceSummary(updated, financeMeta)
  }

  async remove(organizationId: string, resourceId: string): Promise<void> {
    const resource = await this.findResourceOrThrow(organizationId, resourceId)
    this.ensureDepartureEditable(resource.segment.departure)

    const hasSchedule = await this.prisma.paymentSchedule.count({
      where: {
        organizationId,
        sourceId: resource.id,
        direction: PaymentScheduleDirection.payable,
      },
    })

    if (hasSchedule > 0) {
      throw new ConflictException('当前资源已生成应付，不能直接删除')
    }

    await this.prisma.segmentResource.delete({ where: { id: resource.id } })
  }

  async generatePayable(
    organizationId: string,
    resourceId: string,
  ): Promise<GeneratePayableResult> {
    const { schedule, sourceAmountMismatch } = await this.financeBridge.generatePayable(
      organizationId,
      resourceId,
    )
    const resource = await this.findResourceOrThrow(organizationId, resourceId)
    const meta = await this.departureFinanceFacade.getSegmentResourceFinanceState(
      organizationId,
      resourceId,
      resource,
    )
    return {
      schedule,
      resource: this.toResourceSummary(resource, meta),
      sourceAmountMismatch,
    }
  }

  async generatePayablesForSegment(
    organizationId: string,
    segmentId: string,
  ): Promise<BatchFinanceGenerationResult> {
    const segment = await this.findSegmentOrThrow(organizationId, segmentId)
    await this.departureFinanceFacade.assertMutableById(
      organizationId,
      segment.departureId,
      '生成应付',
    )

    const resources = await this.prisma.segmentResource.findMany({
      where: {
        segmentId,
        segment: { departure: { organizationId } },
      },
      include: {
        partner: true,
        supplier: true,
        segment: true,
      },
      orderBy: [{ id: 'asc' }],
    })

    const existingScheduleSourceIds = new Set(
      (
        await this.prisma.paymentSchedule.findMany({
          where: {
            organizationId,
            departureId: segment.departureId,
            direction: PaymentScheduleDirection.payable,
            sourceId: { in: resources.map((resource) => resource.id) },
            voidedAt: null,
          },
          select: { sourceId: true },
          distinct: ['sourceId'],
        })
      ).map((row) => row.sourceId),
    )

    const items: BatchFinanceGenerationItem[] = []

    for (const resource of resources) {
      const sourceLabel =
        resource.title?.trim() ||
        resource.partner?.name ||
        resource.supplier?.name ||
        RESOURCE_KIND_LABELS[resource.resourceKind as SharedResourceKind] ||
        resource.id

      if (existingScheduleSourceIds.has(resource.id)) {
        continue
      }

      if (resource.amountCents <= 0) {
        items.push({
          sourceId: resource.id,
          sourceLabel,
          outcome: 'skipped',
          reason: '资源金额须大于 0 才能生成应付',
        })
        continue
      }

      try {
        await this.generatePayable(organizationId, resource.id)
        items.push({
          sourceId: resource.id,
          sourceLabel,
          outcome: 'succeeded',
          generatedCount: 1,
        })
      } catch (error) {
        if (isAlreadyGeneratedConflict(error)) {
          items.push({
            sourceId: resource.id,
            sourceLabel,
            outcome: 'skipped',
            reason: httpExceptionMessage(error),
          })
          continue
        }
        items.push({
          sourceId: resource.id,
          sourceLabel,
          outcome: 'failed',
          reason: httpExceptionMessage(error),
        })
      }
    }

    return summarizeBatchFinanceGeneration(items)
  }

  private async findSegmentOrThrow(organizationId: string, segmentId: string) {
    const segment = await this.prisma.itinerarySegment.findFirst({
      where: {
        id: segmentId,
        departure: { organizationId },
      },
      include: { departure: true },
    })

    if (!segment) {
      throw new NotFoundException('行程段不存在')
    }

    return segment
  }

  private async findResourceOrThrow(
    organizationId: string,
    resourceId: string,
  ): Promise<SegmentResourceWithRelations> {
    const resource = await this.prisma.segmentResource.findFirst({
      where: {
        id: resourceId,
        segment: { departure: { organizationId } },
      },
      include: {
        partner: true,
        supplier: true,
        segment: { include: { departure: true } },
      },
    })

    if (!resource) {
      throw new NotFoundException('段内资源不存在')
    }

    return resource
  }

  private async ensureSelectablePartner(organizationId: string, partnerId: string) {
    const partner = await this.prisma.partner.findFirst({
      where: { id: partnerId, organizationId },
    })

    if (!partner) {
      throw new BadRequestException('客户不存在')
    }

    if (partner.status !== DirectoryProfileStatus.active) {
      throw new BadRequestException('客户不可用，请选择有效客户')
    }

    return partner
  }

  private async ensureSelectableSupplier(
    organizationId: string,
    supplierId: string,
    resourceKind: ResourceKind,
  ) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: supplierId, organizationId },
    })

    if (!supplier) {
      throw new BadRequestException('供应商不存在')
    }

    if (supplier.status !== DirectoryProfileStatus.active) {
      throw new BadRequestException('供应商不可用，请选择有效供应商')
    }

    if (!supplier.categories.includes(resourceKind)) {
      const label =
        RESOURCE_KIND_LABELS[resourceKind as SharedResourceKind] ?? resourceKind
      throw new BadRequestException(`资源种类「${label}」不属于该供应商的类别集合`)
    }

    return supplier
  }

  private ensureDepartureEditable(departure: Departure) {
    this.departureFinanceFacade.assertMutable(departure, '编辑')
  }

  private toResourceSummary(
    resource: SegmentResourceWithRelations,
    meta?: SegmentResourceFinanceState,
  ): SegmentResourceSummary {
    const counterpartyName =
      resource.resourceKind === ResourceKind.outsource
        ? resource.partner?.name ?? '-'
        : resource.supplier?.name ?? '-'

    return {
      id: resource.id,
      segmentId: resource.segmentId,
      departureId: resource.segment.departureId,
      resourceKind: resource.resourceKind,
      counterpartyType: resource.counterpartyType,
      partnerId: resource.partnerId,
      partnerName: resource.partner?.name ?? null,
      supplierId: resource.supplierId,
      supplierName: resource.supplier?.name ?? null,
      counterpartyName,
      title: resource.title,
      amountCents: resource.amountCents,
      notes: resource.notes,
      hasPaymentSchedule: meta?.hasSchedule ?? false,
      payableStatus: meta?.payableStatus ?? SegmentPayableStatus.NOT_GENERATED,
      hasSourceAmountMismatch: meta?.hasSourceAmountMismatch ?? false,
      amountFieldsLocked: meta?.amountFieldsLocked ?? false,
      paymentScheduleId: meta?.paymentScheduleId ?? null,
      financeTouched: meta?.financeTouched ?? false,
      unsettledAmountCents: meta?.unpaidCents ?? null,
      createdAt: resource.createdAt.toISOString(),
      updatedAt: resource.updatedAt.toISOString(),
    }
  }
}
