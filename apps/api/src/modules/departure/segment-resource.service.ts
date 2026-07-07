import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import type {
  GeneratePayableResult,
  SegmentResourceListResult,
  SegmentResourceSummary,
} from '@xiaotuanbao/shared'
import { SegmentPayableStatus } from '@xiaotuanbao/shared'
import {
  DepartureStatus,
  DirectoryProfileStatus,
  ResourceKind,
  type Departure,
  type ItinerarySegment,
  type Partner,
  type SegmentResource,
  type Supplier,
} from '@prisma/client'
import { PrismaService } from '../../database/prisma/prisma.service'
import type {
  CreateSegmentResourceDto,
  ListSegmentResourcesQueryDto,
  UpdateSegmentResourceDto,
} from './dto/segment-resource.dto'
import {
  DepartureFinanceBridgeService,
  type SegmentResourceFinanceMeta,
} from './departure-finance-bridge.service'
import { resolveSegmentResourceCounterparty } from './segment-resource.validation'

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

    const metaMap = await this.loadFinanceMetaMap(
      organizationId,
      resources.map((resource) => resource.id),
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
      await this.ensureSelectableSupplier(organizationId, counterparty.supplierId!)
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
        fromTemplate: false,
      },
      include: {
        partner: true,
        supplier: true,
        segment: { include: { departure: true } },
      },
    })

    return this.toResourceSummary(created, {
      hasSchedule: false,
      payableStatus: SegmentPayableStatus.NOT_GENERATED,
      hasSourceAmountMismatch: false,
      amountFieldsLocked: false,
    })
  }

  async getById(organizationId: string, resourceId: string): Promise<SegmentResourceSummary> {
    const resource = await this.findResourceOrThrow(organizationId, resourceId)
    const meta = await this.financeBridge.evaluateResourceFinanceMeta(
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
      await this.ensureSelectableSupplier(organizationId, counterparty.supplierId!)
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
        cancelledAt: null,
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
    const meta = await this.financeBridge.evaluateResourceFinanceMeta(
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

  private async loadFinanceMetaMap(organizationId: string, resourceIds: string[]) {
    const map = new Map<string, SegmentResourceFinanceMeta>()

    await Promise.all(
      resourceIds.map(async (resourceId) => {
        const meta = await this.financeBridge.evaluateResourceFinanceMeta(
          organizationId,
          resourceId,
        )
        map.set(resourceId, meta)
      }),
    )

    return map
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

  private async ensureSelectableSupplier(organizationId: string, supplierId: string) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: supplierId, organizationId },
    })

    if (!supplier) {
      throw new BadRequestException('供应商不存在')
    }

    if (supplier.status !== DirectoryProfileStatus.active) {
      throw new BadRequestException('供应商不可用，请选择有效供应商')
    }

    return supplier
  }

  private ensureDepartureEditable(departure: Departure) {
    if (departure.status === DepartureStatus.closed) {
      throw new ConflictException('发团已关闭，不可编辑')
    }
  }

  private toResourceSummary(
    resource: SegmentResourceWithRelations,
    meta?: SegmentResourceFinanceMeta,
  ): SegmentResourceSummary {
    const counterpartyName =
      resource.resourceKind === ResourceKind.outsource
        ? resource.partner?.name ?? '—'
        : resource.supplier?.name ?? '—'

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
      fromTemplate: resource.fromTemplate,
      hasPaymentSchedule: meta?.hasSchedule ?? false,
      payableStatus: meta?.payableStatus ?? SegmentPayableStatus.NOT_GENERATED,
      hasSourceAmountMismatch: meta?.hasSourceAmountMismatch ?? false,
      amountFieldsLocked: meta?.amountFieldsLocked ?? false,
    }
  }
}
