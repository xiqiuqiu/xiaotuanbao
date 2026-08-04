import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import {
  PaymentScheduleSourceType,
  RESOURCE_KIND_LABELS,
  SegmentPayableStatus,
  type DepartureResourceListResult,
  type DepartureResourceSummary,
  type GenerateDeparturePayableResult,
  type ResourceKind as SharedResourceKind,
} from '@xiaotuanbao/shared'
import {
  CounterpartyType,
  DirectoryProfileStatus,
  ResourceKind,
  type Departure,
  type DepartureResource,
  type Partner,
  type Supplier,
} from '@prisma/client'
import { PrismaService } from '../../database/prisma/prisma.service'
import {
  DepartureFinanceFacade,
  type SegmentResourceFinanceState,
} from '../finance/departure-finance-facade.service'
import type {
  CreateDepartureResourceDto,
  ListDepartureResourcesQueryDto,
  UpdateDepartureResourceDto,
} from './dto/departure-resource.dto'
import {
  resolveSegmentResourceCounterparty,
  resolveSegmentResourceCounterpartyForUpdate,
} from './segment-resource.validation'

type DepartureResourceWithRelations = DepartureResource & {
  partner: Partner | null
  supplier: Supplier | null
  departure: Departure
}

@Injectable()
export class DepartureResourceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly departureFinanceFacade: DepartureFinanceFacade,
  ) {}

  async listByDeparture(
    organizationId: string,
    departureId: string,
    query: ListDepartureResourcesQueryDto,
  ): Promise<DepartureResourceListResult> {
    const departure = await this.findDepartureOrThrow(organizationId, departureId)
    const keyword = query.keyword?.trim()

    const resources = await this.prisma.departureResource.findMany({
      where: {
        departureId: departure.id,
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
        departure: true,
      },
      orderBy: [{ id: 'asc' }],
    })

    const metaMap = await this.departureFinanceFacade.getDepartureResourceFinanceStates(
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
    departureId: string,
    dto: CreateDepartureResourceDto,
  ): Promise<DepartureResourceSummary> {
    const departure = await this.findDepartureOrThrow(organizationId, departureId)
    this.ensureDepartureEditable(departure)

    const counterparty = resolveSegmentResourceCounterparty({
      resourceKind: dto.resourceKind,
      partnerId: dto.partnerId,
      supplierId: dto.supplierId,
    })

    await this.ensureSelectableSupplier(
      organizationId,
      counterparty.supplierId!,
      dto.resourceKind,
    )

    const created = await this.prisma.departureResource.create({
      data: {
        departureId: departure.id,
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
        departure: true,
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

  async getById(organizationId: string, resourceId: string): Promise<DepartureResourceSummary> {
    const resource = await this.findResourceOrThrow(organizationId, resourceId)
    const meta = await this.departureFinanceFacade.getDepartureResourceFinanceState(
      organizationId,
      resource.id,
      resource,
    )
    return this.toResourceSummary(resource, meta)
  }

  async update(
    organizationId: string,
    resourceId: string,
    dto: UpdateDepartureResourceDto,
  ): Promise<DepartureResourceSummary> {
    const resource = await this.findResourceOrThrow(organizationId, resourceId)
    this.ensureDepartureEditable(resource.departure)

    const resourceKind = dto.resourceKind ?? resource.resourceKind
    const supplierId =
      dto.supplierId !== undefined ? dto.supplierId : resource.supplierId ?? undefined

    const counterparty = resolveSegmentResourceCounterpartyForUpdate({
      resourceKind,
      partnerId: dto.partnerId,
      supplierId,
      existing: {
        counterpartyType: resource.counterpartyType,
        partnerId: resource.partnerId,
        supplierId: resource.supplierId,
      },
    })

    if (counterparty.supplierId) {
      await this.ensureSelectableSupplier(
        organizationId,
        counterparty.supplierId,
        resourceKind,
      )
    }

    const nextAmountCents = dto.amountCents ?? resource.amountCents
    await this.departureFinanceFacade.assertDepartureResourceAmountEditable(
      organizationId,
      resource.id,
      resource.amountCents,
      nextAmountCents,
    )

    const updated = await this.prisma.departureResource.update({
      where: { id: resource.id },
      data: {
        ...(dto.resourceKind !== undefined ? { resourceKind } : {}),
        counterpartyType: counterparty.counterpartyType,
        partnerId: counterparty.partnerId,
        supplierId: counterparty.supplierId,
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.amountCents !== undefined ? { amountCents: dto.amountCents } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes?.trim() || null } : {}),
        pendingCheck: false,
      },
      include: {
        partner: true,
        supplier: true,
        departure: true,
      },
    })

    const financeMeta = await this.departureFinanceFacade.syncDepartureResourceSchedule(
      organizationId,
      updated,
    )
    return this.toResourceSummary(updated, financeMeta)
  }

  async remove(organizationId: string, resourceId: string): Promise<void> {
    const resource = await this.findResourceOrThrow(organizationId, resourceId)
    this.ensureDepartureEditable(resource.departure)

    const presence = await this.departureFinanceFacade.getResourceFinancePresence(
      organizationId,
      {
        sourceType: PaymentScheduleSourceType.DEPARTURE_RESOURCE,
        sourceId: resource.id,
      },
    )
    if (presence.blocksRemoval) {
      throw new ConflictException('当前资源已提交应付，不能直接删除')
    }

    await this.prisma.departureResource.delete({ where: { id: resource.id } })
  }

  async generatePayable(
    organizationId: string,
    resourceId: string,
  ): Promise<GenerateDeparturePayableResult> {
    const { schedule, sourceAmountMismatch } =
      await this.departureFinanceFacade.generateResourcePayable(organizationId, {
        sourceType: PaymentScheduleSourceType.DEPARTURE_RESOURCE,
        sourceId: resourceId,
      })
    const resource = await this.findResourceOrThrow(organizationId, resourceId)
    const meta = await this.departureFinanceFacade.getDepartureResourceFinanceState(
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

  private async findDepartureOrThrow(organizationId: string, departureId: string) {
    const departure = await this.prisma.departure.findFirst({
      where: { id: departureId, organizationId },
    })

    if (!departure) {
      throw new NotFoundException('发团不存在')
    }

    return departure
  }

  private async findResourceOrThrow(
    organizationId: string,
    resourceId: string,
  ): Promise<DepartureResourceWithRelations> {
    const resource = await this.prisma.departureResource.findFirst({
      where: {
        id: resourceId,
        departure: { organizationId },
      },
      include: {
        partner: true,
        supplier: true,
        departure: true,
      },
    })

    if (!resource) {
      throw new NotFoundException('发团级资源不存在')
    }

    return resource
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
    resource: DepartureResourceWithRelations,
    meta?: SegmentResourceFinanceState,
  ): DepartureResourceSummary {
    const counterpartyName =
      resource.counterpartyType === CounterpartyType.partner
        ? resource.partner?.name ?? '-'
        : resource.supplier?.name ?? '-'

    return {
      id: resource.id,
      departureId: resource.departureId,
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
      pendingCheck: resource.pendingCheck,
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
