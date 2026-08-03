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
  type BatchFinanceGenerationItem,
  type BatchFinanceGenerationResult,
  type GeneratePayableResult,
  type ResourceKind as SharedResourceKind,
  type SegmentResourceListResult,
  type SegmentResourceSummary,
  type PartnerOutsourceOrderListResult,
  type SupplierServiceOrderListResult,
} from '@xiaotuanbao/shared'
import {
  CounterpartyType,
  DirectoryProfileStatus,
  PaymentScheduleDirection,
  ResourceKind,
  type Departure,
  type ItinerarySegment,
  type Partner,
  type Prisma,
  type SegmentResource,
  type Supplier,
} from '@prisma/client'
import { PrismaService } from '../../database/prisma/prisma.service'
import { DepartureFinanceFacade } from '../finance/departure-finance-facade.service'
import { formatDateOnly, parseDateOnly } from './departure-date.utils'
import type {
  CreateSegmentResourceDto,
  ListSegmentResourcesQueryDto,
  ListSupplierServiceOrdersQueryDto,
  UpdateSegmentResourceDto,
} from './dto/segment-resource.dto'
import type { SegmentResourceFinanceState } from '../finance/departure-finance-facade.service'
import {
  resolveSegmentResourceCounterparty,
  resolveSegmentResourceCounterpartyForUpdate,
} from './segment-resource.validation'
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

  /**
   * 供应商服务团单 Tab：跨发团查询引用该供应商的资源行（含拼出／旅行社，业务事实层）。
   * 出团日期区间过滤＋默认倒序＋分页；三项汇总覆盖整个筛选集，不随分页变化。
   */
  async listBySupplier(
    organizationId: string,
    supplierId: string,
    query: ListSupplierServiceOrdersQueryDto,
  ): Promise<SupplierServiceOrderListResult> {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: supplierId, organizationId },
    })
    if (!supplier) {
      throw new NotFoundException('供应商不存在')
    }

    if (
      query.departureDateFrom &&
      query.departureDateTo &&
      query.departureDateFrom > query.departureDateTo
    ) {
      throw new BadRequestException('出团日期区间非法')
    }

    const page = Math.max(Number(query.page) || 1, 1)
    const pageSize = Math.min(Math.max(Number(query.pageSize) || 10, 1), 100)

    const departureWhere: Prisma.DepartureWhereInput = {
      organizationId,
      ...(query.departureDateFrom || query.departureDateTo
        ? {
            startDate: {
              ...(query.departureDateFrom
                ? { gte: parseDateOnly(query.departureDateFrom) }
                : {}),
              ...(query.departureDateTo
                ? { lte: parseDateOnly(query.departureDateTo) }
                : {}),
            },
          }
        : {}),
    }

    const where: Prisma.SegmentResourceWhereInput = {
      supplierId: supplier.id,
      segment: { departure: departureWhere },
    }

    const [resources, total, aggregate, distinctDepartures] = await Promise.all([
      this.prisma.segmentResource.findMany({
        where,
        include: {
          segment: {
            select: {
              name: true,
              departureId: true,
              departure: {
                select: {
                  departureNo: true,
                  name: true,
                  routeName: true,
                  startDate: true,
                },
              },
            },
          },
        },
        orderBy: [
          { segment: { departure: { startDate: 'desc' } } },
          { createdAt: 'desc' },
        ],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.segmentResource.count({ where }),
      this.prisma.segmentResource.aggregate({
        where,
        _sum: { amountCents: true },
      }),
      // 关联发团数：按 departureId DB 级去重，结果集上限为发团数而非资源行数。
      this.prisma.itinerarySegment.findMany({
        where: {
          departure: departureWhere,
          resources: {
            some: {
              supplierId: supplier.id,
            },
          },
        },
        select: { departureId: true },
        distinct: ['departureId'],
      }),
    ])

    const departureCount = distinctDepartures.length

    return {
      items: resources.map((resource) => ({
        id: resource.id,
        departureId: resource.segment.departureId,
        departureNo: resource.segment.departure.departureNo,
        departureName: resource.segment.departure.name,
        routeName: resource.segment.departure.routeName,
        departureStartDate: formatDateOnly(resource.segment.departure.startDate),
        segmentId: resource.segmentId,
        segmentName: resource.segment.name,
        resourceKind: resource.resourceKind,
        title: resource.title,
        amountCents: resource.amountCents,
        notes: resource.notes,
      })),
      total,
      page,
      pageSize,
      summary: {
        resourceRowCount: total,
        departureCount,
        totalAmountCents: aggregate._sum.amountCents ?? 0,
      },
    }
  }

  /**
   * 合作团单·拼出分段：跨发团查询历史以该 Partner 为承接方的拼出资源行（业务事实层）。
   * 新写拼出挂供应商；本接口仅覆盖存量 Partner 承接行。
   * 出团日期区间过滤＋默认倒序＋分页；三项汇总覆盖整个筛选集，不随分页变化。
   */
  async listOutsourceByPartner(
    organizationId: string,
    partnerId: string,
    query: ListSupplierServiceOrdersQueryDto,
  ): Promise<PartnerOutsourceOrderListResult> {
    const partner = await this.prisma.partner.findFirst({
      where: { id: partnerId, organizationId },
    })
    if (!partner) {
      throw new NotFoundException('合作伙伴不存在')
    }

    if (
      query.departureDateFrom &&
      query.departureDateTo &&
      query.departureDateFrom > query.departureDateTo
    ) {
      throw new BadRequestException('出团日期区间非法')
    }

    const page = Math.max(Number(query.page) || 1, 1)
    const pageSize = Math.min(Math.max(Number(query.pageSize) || 10, 1), 100)

    const departureWhere: Prisma.DepartureWhereInput = {
      organizationId,
      ...(query.departureDateFrom || query.departureDateTo
        ? {
            startDate: {
              ...(query.departureDateFrom
                ? { gte: parseDateOnly(query.departureDateFrom) }
                : {}),
              ...(query.departureDateTo
                ? { lte: parseDateOnly(query.departureDateTo) }
                : {}),
            },
          }
        : {}),
    }

    const where: Prisma.SegmentResourceWhereInput = {
      partnerId: partner.id,
      resourceKind: ResourceKind.outsource,
      segment: { departure: departureWhere },
    }

    const [resources, total, aggregate, distinctDepartures] = await Promise.all([
      this.prisma.segmentResource.findMany({
        where,
        include: {
          segment: {
            select: {
              name: true,
              departureId: true,
              departure: {
                select: {
                  departureNo: true,
                  name: true,
                  routeName: true,
                  startDate: true,
                },
              },
            },
          },
        },
        orderBy: [
          { segment: { departure: { startDate: 'desc' } } },
          { createdAt: 'desc' },
        ],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.segmentResource.count({ where }),
      this.prisma.segmentResource.aggregate({
        where,
        _sum: { amountCents: true },
      }),
      this.prisma.itinerarySegment.findMany({
        where: {
          departure: departureWhere,
          resources: {
            some: {
              partnerId: partner.id,
              resourceKind: ResourceKind.outsource,
            },
          },
        },
        select: { departureId: true },
        distinct: ['departureId'],
      }),
    ])

    return {
      items: resources.map((resource) => ({
        id: resource.id,
        departureId: resource.segment.departureId,
        departureNo: resource.segment.departure.departureNo,
        departureName: resource.segment.departure.name,
        routeName: resource.segment.departure.routeName,
        departureStartDate: formatDateOnly(resource.segment.departure.startDate),
        segmentId: resource.segmentId,
        segmentName: resource.segment.name,
        title: resource.title,
        amountCents: resource.amountCents,
        notes: resource.notes,
      })),
      total,
      page,
      pageSize,
      summary: {
        resourceRowCount: total,
        departureCount: distinctDepartures.length,
        totalAmountCents: aggregate._sum.amountCents ?? 0,
      },
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

    await this.ensureSelectableSupplier(
      organizationId,
      counterparty.supplierId!,
      dto.resourceKind,
    )

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
    // 写路径统一走供应商；勿把历史 partnerId 并入 resolve（否则会与 supplier 冲突）。
    // 无 supplier 时由 ForUpdate 保留历史 Partner 拼出行（ADR-0032）。
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
    await this.departureFinanceFacade.assertResourceAmountEditable(
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
        pendingCheck: false,
      },
      include: {
        partner: true,
        supplier: true,
        segment: { include: { departure: true } },
      },
    })

    const financeMeta = await this.departureFinanceFacade.syncSegmentResourceSchedule(
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
      throw new ConflictException('当前资源已提交应付，不能直接删除')
    }

    await this.prisma.segmentResource.delete({ where: { id: resource.id } })
  }

  async generatePayable(
    organizationId: string,
    resourceId: string,
  ): Promise<GeneratePayableResult> {
    const { schedule, sourceAmountMismatch } =
      await this.departureFinanceFacade.generateResourcePayable(organizationId, {
        sourceType: PaymentScheduleSourceType.SEGMENT_RESOURCE,
        sourceId: resourceId,
      })
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
    await this.departureFinanceFacade.assertAllowsNewObligationById(
      organizationId,
      segment.departureId,
      '提交应付',
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
          reason: '资源金额须大于 0 才能提交应付',
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
      resource.counterpartyType === CounterpartyType.partner
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
