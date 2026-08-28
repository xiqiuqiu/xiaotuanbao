import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import {
  buildOutOfRangeItinerarySegmentConflict,
  formatOutOfRangeItinerarySegmentSummary,
  listOutOfRangeItinerarySegments,
  type DepartureArchiveHistoryItem,
  type DepartureDetail,
  type DepartureListResult,
  type DepartureRouteNamesResult,
  type DepartureSettlementHistoryItem,
  type FormalDepartureAttachmentView,
  type DepartureSummary,
  type RouteLedgerDateBlock,
  type RouteLedgerDepartureGroup,
  type RouteLedgerOutsourceLine,
  type RouteLedgerOutsourceSummary,
  type RouteLedgerResult,
  type RouteLedgerRouteGroup,
  type RouteLedgerSourceOrderRow,
  type RouteLedgerTotals,
} from '@xiaotuanbao/shared'
import {
  CounterpartyType,
  DepartureArchiveAction,
  DepartureRouteSource,
  DepartureStatus,
  DepartureType,
  DirectoryProfileStatus,
  ResourceKind,
  type Departure,
  type DepartureArchiveHistory,
  type DepartureSettlementHistory,
  type Prisma,
} from '@prisma/client'
import { PrismaService } from '../../database/prisma/prisma.service'
import { NumberAllocationService } from '../number-allocation/number-allocation.service'
import { DepartureFinanceFacade } from '../finance/departure-finance-facade.service'
import type {
  CreateDepartureDto,
  CopyDepartureDto,
  CloseDepartureDto,
  ListDeparturesQueryDto,
  ListRouteLedgerQueryDto,
  TransitionDepartureDto,
  UnarchiveDepartureDto,
  UpdateDepartureDto,
  RegisterDepartureAttachmentDto,
} from './dto/departure.dto'
import {
  computeDayCount,
  deriveDepartureProgress,
  formatDateOnly,
  parseDateOnly,
} from './departure-date.utils'
import { fillMissingDailySkeletonInTx } from './daily-segment-skeleton.write'
import { DepartureCopyService } from './departure-copy.service'
import { RouteTemplateCopyService } from './route-template-copy.service'
import { listRouteLedgerCostResources } from './route-ledger-arrangement-resources'
import { assertRouteLedgerQueryAxes } from './route-ledger.validation'
import { RouteTemplateService } from './route-template.service'
import { DepartureReadModelService } from './departure-read-model.service'
import {
  emptyDepartureReadModelAggregate,
  type DepartureReadModelAggregate,
} from './departure-read-model.utils'
import { DepartureDataGapService } from './departure-data-gap.service'
import { AccountGenerationGapService } from './account-generation-gap.service'
import {
  buildDepartureOperationalWindowWhere,
  getDepartureOperationalDates,
} from './departure-operational-window'
import { DepartureSettlementReadinessService } from './departure-settlement-readiness.service'

const UPDATE_DEPARTURE_FIELDS = [
  'name',
  'routeName',
  'departureType',
  'startDate',
  'endDate',
  'ownerUserId',
  'notes',
  'driverSupplierId',
  'guideSupplierId',
  'vehiclePlate',
  'contactPhone',
] as const

const TRANSITION_TARGETS: Partial<Record<DepartureStatus, DepartureStatus[]>> = {
  [DepartureStatus.editing]: [DepartureStatus.pending_settlement],
  [DepartureStatus.pending_settlement]: [DepartureStatus.settled],
}

const PURGEABLE_STATUSES: DepartureStatus[] = [
  DepartureStatus.editing,
  DepartureStatus.pending_settlement,
]

@Injectable()
export class DepartureService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly routeTemplateService: RouteTemplateService,
    private readonly routeTemplateCopyService: RouteTemplateCopyService,
    private readonly departureCopyService: DepartureCopyService,
    private readonly departureReadModelService: DepartureReadModelService,
    private readonly numberAllocationService: NumberAllocationService,
    private readonly departureFinanceFacade: DepartureFinanceFacade,
    private readonly departureDataGapService: DepartureDataGapService,
    private readonly accountGenerationGapService: AccountGenerationGapService,
    private readonly departureSettlementReadinessService: DepartureSettlementReadinessService,
  ) {}

  async listRouteNames(organizationId: string): Promise<DepartureRouteNamesResult> {
    const rows = await this.prisma.departure.findMany({
      where: {
        organizationId,
        routeName: { not: '' },
      },
      select: { routeName: true },
      distinct: ['routeName'],
      orderBy: { routeName: 'asc' },
    })

    return {
      items: rows.map((row) => row.routeName),
    }
  }

  /**
   * 线路视图读模型（#183 + #184 + #185 + #221）：
   * 路线和/或完整出团日区间 → 日块 → 路线段 → 发团组 → 客源行；
   * 拼出（Resource Kind）汇总挂在日/路线段/发团，不进客源行。
   * 客源行附游客代表（名单最早一条）与拼入单价（前端只读算式输入，不参与合计权威计算）。
   */
  async getRouteLedger(
    organizationId: string,
    query: ListRouteLedgerQueryDto,
  ): Promise<RouteLedgerResult> {
    const { routeName, startDateFrom, startDateTo } = assertRouteLedgerQueryAxes(query)

    const where: Prisma.DepartureWhereInput = {
      organizationId,
      ...(routeName ? { routeName } : {}),
    }
    if (startDateFrom && startDateTo) {
      where.startDate = {
        gte: parseDateOnly(startDateFrom),
        lte: parseDateOnly(startDateTo),
      }
    }

    const departures = await this.prisma.departure.findMany({
      where,
      select: {
        id: true,
        departureNo: true,
        name: true,
        routeName: true,
        startDate: true,
        sourceOrders: {
          select: {
            id: true,
            departureId: true,
            partnerId: true,
            displayName: true,
            adultGuestCount: true,
            childGuestCount: true,
            guestCount: true,
            adultUnitPriceCents: true,
            childUnitPriceCents: true,
            grossReceivableCents: true,
            netReceivableCents: true,
            partnerCollectedCents: true,
            guestCollectCents: true,
            notes: true,
            partner: { select: { name: true } },
            guests: {
              orderBy: { createdAt: 'asc' },
              take: 1,
              select: { name: true, phone: true },
            },
            createdAt: true,
          },
          orderBy: { createdAt: 'asc' },
        },
        itinerarySegments: {
          select: {
            name: true,
            sortOrder: true,
            resources: {
              select: {
                id: true,
                resourceKind: true,
                title: true,
                amountCents: true,
                notes: true,
                counterpartyType: true,
                createdAt: true,
                partner: { select: { name: true } },
                supplier: { select: { name: true } },
              },
              orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            },
          },
          orderBy: { sortOrder: 'asc' },
        },
        departureResources: {
          select: {
            id: true,
            resourceKind: true,
            title: true,
            amountCents: true,
            notes: true,
            counterpartyType: true,
            createdAt: true,
            partner: { select: { name: true } },
            supplier: { select: { name: true } },
          },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        },
      },
      orderBy: [{ startDate: 'asc' }, { departureNo: 'asc' }],
    })

    type MutableRouteGroup = RouteLedgerRouteGroup
    type MutableDateBlock = {
      startDate: string
      routesByName: Map<string, MutableRouteGroup>
    }

    const blocksByDate = new Map<string, MutableDateBlock>()

    for (const departure of departures) {
      const startDate = formatDateOnly(departure.startDate)
      const sourceOrders: RouteLedgerSourceOrderRow[] = departure.sourceOrders.map((order) => {
        const representative = order.guests[0] ?? null
        return {
          id: order.id,
          departureId: order.departureId,
          partnerId: order.partnerId,
          partnerName: order.partner.name,
          displayName: order.displayName,
          guestRepresentativeName: representative?.name ?? null,
          guestRepresentativePhone: representative?.phone ?? null,
          adultGuestCount: order.adultGuestCount,
          childGuestCount: order.childGuestCount,
          guestCount: order.guestCount,
          adultUnitPriceCents: order.adultUnitPriceCents,
          childUnitPriceCents: order.childUnitPriceCents,
          grossReceivableCents: order.grossReceivableCents,
          netReceivableCents: order.netReceivableCents,
          partnerCollectedCents: order.partnerCollectedCents,
          guestCollectCents: order.guestCollectCents,
          notes: order.notes,
        }
      })
      const outsourceItems: RouteLedgerOutsourceLine[] = [
        ...departure.itinerarySegments.flatMap((segment) =>
          segment.resources
            .filter((resource) => resource.resourceKind === ResourceKind.outsource)
            .map((resource) => ({
              id: resource.id,
              supplierName:
                resource.counterpartyType === CounterpartyType.partner
                  ? (resource.partner?.name ?? '-')
                  : (resource.supplier?.name ?? '-'),
              amountCents: resource.amountCents,
              title: resource.title,
            })),
        ),
        ...departure.departureResources
          .filter((resource) => resource.resourceKind === ResourceKind.outsource)
          .map((resource) => ({
            id: resource.id,
            supplierName:
              resource.counterpartyType === CounterpartyType.partner
                ? (resource.partner?.name ?? '-')
                : (resource.supplier?.name ?? '-'),
            amountCents: resource.amountCents,
            title: resource.title,
          })),
      ]
      const costResources = listRouteLedgerCostResources(departure)
      const group: RouteLedgerDepartureGroup = {
        departureId: departure.id,
        departureNo: departure.departureNo,
        departureName: departure.name,
        startDate,
        totals: sumRouteLedgerRows(sourceOrders),
        outsource: toRouteLedgerOutsourceSummary(outsourceItems),
        costResources,
        sourceOrders,
      }

      let block = blocksByDate.get(startDate)
      if (!block) {
        block = {
          startDate,
          routesByName: new Map(),
        }
        blocksByDate.set(startDate, block)
      }

      let routeGroup = block.routesByName.get(departure.routeName)
      if (!routeGroup) {
        routeGroup = {
          routeName: departure.routeName,
          totals: emptyRouteLedgerTotals(),
          outsource: emptyRouteLedgerOutsourceSummary(),
          departures: [],
        }
        block.routesByName.set(departure.routeName, routeGroup)
      }
      routeGroup.departures.push(group)
    }

    const dateBlocks: RouteLedgerDateBlock[] = [...blocksByDate.values()].map((block) => {
      const routes = [...block.routesByName.values()]
        .sort((left, right) => left.routeName.localeCompare(right.routeName, 'zh-CN'))
        .map((routeGroup) => ({
          ...routeGroup,
          totals: sumRouteLedgerTotals(routeGroup.departures.map((group) => group.totals)),
          outsource: toRouteLedgerOutsourceSummary(
            routeGroup.departures.flatMap((group) => group.outsource.items),
          ),
        }))

      return {
        startDate: block.startDate,
        routes,
        totals: sumRouteLedgerTotals(routes.map((routeGroup) => routeGroup.totals)),
        outsource: toRouteLedgerOutsourceSummary(
          routes.flatMap((routeGroup) => routeGroup.outsource.items),
        ),
      }
    })

    return {
      routeName,
      startDateFrom,
      startDateTo,
      dateBlocks,
    }
  }

  async list(
    organizationId: string,
    query: ListDeparturesQueryDto,
  ): Promise<DepartureListResult> {
    const page = Math.max(Number(query.page) || 1, 1)
    const pageSize = Math.min(Math.max(Number(query.pageSize) || 10, 1), 100)
    const keyword = query.keyword?.trim()
    const operationalDates = getDepartureOperationalDates(new Date())
    const { today } = operationalDates
    const andFilters: Prisma.DepartureWhereInput[] = []

    const where: Prisma.DepartureWhereInput = {
      organizationId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.routeName?.trim()
        ? { routeName: { contains: query.routeName.trim(), mode: 'insensitive' } }
        : {}),
      ...(query.departureType ? { departureType: query.departureType } : {}),
      ...(query.ownerUserId ? { ownerUserId: query.ownerUserId } : {}),
      ...(query.partnerId
        ? { sourceOrders: { some: { partnerId: query.partnerId } } }
        : {}),
      ...(keyword
        ? {
            OR: [
              { departureNo: { contains: keyword, mode: 'insensitive' } },
              { name: { contains: keyword, mode: 'insensitive' } },
            ],
          }
        : {}),
    }

    if (query.startDateFrom || query.startDateTo) {
      where.startDate = {
        ...(query.startDateFrom ? { gte: parseDateOnly(query.startDateFrom) } : {}),
        ...(query.startDateTo ? { lte: parseDateOnly(query.startDateTo) } : {}),
      }
    }

    if (query.departureProgress) {
      if (query.departureProgress === 'not_started') {
        andFilters.push({ startDate: { gt: parseDateOnly(today) } })
      } else if (query.departureProgress === 'in_progress') {
        andFilters.push({
          startDate: { lte: parseDateOnly(today) },
          endDate: { gte: parseDateOnly(today) },
        })
      } else {
        andFilters.push({ endDate: { lt: parseDateOnly(today) } })
      }
    }

    if (query.operationalWindow) {
      andFilters.push(
        buildDepartureOperationalWindowWhere(query.operationalWindow, operationalDates),
      )
    }

    if (query.excludeClosed === '1' && !query.status) {
      andFilters.push({ status: { not: DepartureStatus.closed } })
    }

    if (query.departureDataGap === 'any') {
      const dataGapsByDepartureId = await this.departureDataGapService.findByOrganization(
        organizationId,
      )
      const departureIds = [...dataGapsByDepartureId.entries()]
        .filter(([, dataGaps]) => dataGaps.length > 0)
        .map(([departureId]) => departureId)
      andFilters.push({ id: { in: departureIds } })
    }

    if (query.settlementReadiness === 'ready') {
      const departureIds =
        await this.departureSettlementReadinessService.findReadyDepartureIds(organizationId)
      andFilters.push({ id: { in: departureIds } })
    }

    if (query.accountGenerationGap) {
      const departureIds = await this.accountGenerationGapService.findDepartureIdsWithGaps(
        organizationId,
        query.accountGenerationGap,
      )
      andFilters.push({ id: { in: departureIds } })
    }

    if (andFilters.length > 0) {
      where.AND = andFilters
    }

    const [items, total] = await Promise.all([
      this.prisma.departure.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.departure.count({ where }),
    ])

    const summaries = await this.enrichSummaries(items)

    return {
      items: summaries,
      total,
      page,
      pageSize,
    }
  }

  async previewNextDepartureNo(organizationId: string): Promise<{ departureNo: string }> {
    const departureNo = await this.numberAllocationService.previewDepartureNo(organizationId)
    return { departureNo }
  }

  async create(organizationId: string, dto: CreateDepartureDto): Promise<DepartureSummary> {
    const departure = await this.prisma.$transaction(async (tx) =>
      this.createRecord(organizationId, dto, tx),
    )

    const [summary] = await this.enrichSummaries([departure])
    return summary
  }

  /** 在调用方事务内创建发团记录（含团号、模板复制与日骨架）。 */
  async createRecord(
    organizationId: string,
    dto: CreateDepartureDto,
    tx: Prisma.TransactionClient,
  ): Promise<Departure> {
    const name = dto.name.trim()
    let routeName = dto.routeName.trim()

    if (!name) {
      throw new BadRequestException('团名不能为空')
    }

    const startDate = parseDateOnly(dto.startDate)
    const endDate = parseDateOnly(dto.endDate)

    if (endDate < startDate) {
      throw new BadRequestException('结束日期不能早于出团日期')
    }

    await this.ensureOwnerInOrganization(organizationId, dto.ownerUserId)

    const templateId = dto.templateId?.trim()
    let routeSource: DepartureRouteSource = DepartureRouteSource.manual
    let sourceTemplateId: string | null = null

    if (templateId) {
      const template = await this.routeTemplateService.findForCopy(organizationId, templateId)
      routeSource = DepartureRouteSource.template
      sourceTemplateId = template.id
      if (!routeName) {
        routeName = template.name
      }
    }

    if (!routeName) {
      throw new BadRequestException('路线名称不能为空')
    }

    if (dto.driverSupplierId) {
      await this.ensureCrewSupplier(
        organizationId,
        dto.driverSupplierId,
        ResourceKind.transport,
        '司机必须选择含「用车」类别的供应商',
      )
    }
    if (dto.guideSupplierId) {
      await this.ensureCrewSupplier(
        organizationId,
        dto.guideSupplierId,
        ResourceKind.guide,
        '导游必须选择含「导游」类别的供应商',
      )
    }

    const dayCount = computeDayCount(startDate, endDate)

    const departureNo = await this.numberAllocationService.allocateDepartureNo(organizationId, tx)

    const created = await tx.departure.create({
      data: {
        organizationId,
        departureNo,
        name,
        routeName,
        routeSource,
        sourceTemplateId,
        departureType: dto.departureType ?? DepartureType.combined,
        startDate,
        endDate,
        dayCount,
        ownerUserId: dto.ownerUserId,
        status: DepartureStatus.editing,
        notes: dto.notes?.trim() || null,
        driverSupplierId: dto.driverSupplierId || null,
        guideSupplierId: dto.guideSupplierId || null,
        vehiclePlate: dto.vehiclePlate?.trim() || null,
        contactPhone: dto.contactPhone?.trim() || null,
      },
    })

    if (templateId) {
      await this.routeTemplateCopyService.copyToDeparture({
        tx,
        organizationId,
        departureId: created.id,
        departureStartDate: startDate,
        templateId,
      })

      await tx.routeTemplate.update({
        where: { id: templateId },
        data: { usageCount: { increment: 1 } },
      })
    }

    await fillMissingDailySkeletonInTx(tx, created.id, startDate, endDate)

    return created
  }

  async copy(
    organizationId: string,
    sourceDepartureId: string,
    dto: CopyDepartureDto,
  ): Promise<DepartureSummary> {
    const departure = await this.prisma.$transaction(async (tx) =>
      this.copyRecord(organizationId, sourceDepartureId, dto, tx),
    )

    const [summary] = await this.enrichSummaries([departure])
    return summary
  }

  /** 在调用方事务内复制发团记录。 */
  async copyRecord(
    organizationId: string,
    sourceDepartureId: string,
    dto: CopyDepartureDto,
    tx: Prisma.TransactionClient,
  ): Promise<Departure> {
    const sourceDeparture = await this.departureCopyService.findForCopy(
      organizationId,
      sourceDepartureId,
    )

    const name = dto.name.trim()
    if (!name) {
      throw new BadRequestException('团名不能为空')
    }

    const startDate = parseDateOnly(dto.startDate)
    const endDate = parseDateOnly(dto.endDate)

    if (endDate < startDate) {
      throw new BadRequestException('结束日期不能早于出团日期')
    }

    await this.ensureOwnerInOrganization(organizationId, dto.ownerUserId)

    const dayCount = computeDayCount(startDate, endDate)

    const departureNo = await this.numberAllocationService.allocateDepartureNo(organizationId, tx)

    const created = await tx.departure.create({
      data: {
        organizationId,
        departureNo,
        name,
        routeName: sourceDeparture.routeName,
        routeSource: DepartureRouteSource.copy,
        sourceTemplateId: null,
        departureType: dto.departureType ?? sourceDeparture.departureType,
        startDate,
        endDate,
        dayCount,
        ownerUserId: dto.ownerUserId,
        status: DepartureStatus.editing,
        notes: dto.notes?.trim() || null,
      },
    })

    await this.departureCopyService.copyToDeparture({
      tx,
      organizationId,
      sourceDepartureId,
      targetDepartureId: created.id,
      targetStartDate: startDate,
    })

    await fillMissingDailySkeletonInTx(tx, created.id, startDate, endDate)

    return created
  }

  /** 新建发团后、读模型计数仍为空时的摘要映射（供确认事务内幂等缓存）。 */
  toFreshDepartureSummary(departure: Departure): DepartureSummary {
    return this.toDepartureSummary(departure)
  }

  async getById(organizationId: string, departureId: string): Promise<DepartureDetail> {
    const departure = await this.findDepartureOrThrow(organizationId, departureId)
    return this.toDepartureDetailAsync(departure)
  }

  async update(
    organizationId: string,
    departureId: string,
    dto: UpdateDepartureDto,
  ): Promise<DepartureDetail> {
    const departure = await this.findDepartureOrThrow(organizationId, departureId)

    this.departureFinanceFacade.assertMutable(departure, '编辑')

    if (!this.hasUpdateFields(dto)) {
      throw new BadRequestException('请至少提供一个待更新字段')
    }

    const data: Prisma.DepartureUpdateInput = {}

    if (dto.name !== undefined) {
      const name = dto.name.trim()
      if (!name) {
        throw new BadRequestException('团名不能为空')
      }
      data.name = name
    }

    if (dto.routeName !== undefined) {
      const routeName = dto.routeName.trim()
      if (!routeName) {
        throw new BadRequestException('路线名称不能为空')
      }
      data.routeName = routeName
    }

    if (dto.departureType !== undefined) {
      data.departureType = dto.departureType
    }

    if (dto.ownerUserId !== undefined) {
      await this.ensureOwnerInOrganization(organizationId, dto.ownerUserId)
      data.owner = { connect: { id: dto.ownerUserId } }
    }

    if (dto.notes !== undefined) {
      data.notes = dto.notes?.trim() || null
    }

    if (dto.driverSupplierId !== undefined) {
      if (dto.driverSupplierId) {
        if (dto.driverSupplierId !== departure.driverSupplierId) {
          await this.ensureCrewSupplier(
            organizationId,
            dto.driverSupplierId,
            ResourceKind.transport,
            '司机必须选择含「用车」类别的供应商',
          )
        }
        data.driverSupplier = { connect: { id: dto.driverSupplierId } }
      } else {
        data.driverSupplier = { disconnect: true }
      }
    }

    if (dto.guideSupplierId !== undefined) {
      if (dto.guideSupplierId) {
        if (dto.guideSupplierId !== departure.guideSupplierId) {
          await this.ensureCrewSupplier(
            organizationId,
            dto.guideSupplierId,
            ResourceKind.guide,
            '导游必须选择含「导游」类别的供应商',
          )
        }
        data.guideSupplier = { connect: { id: dto.guideSupplierId } }
      } else {
        data.guideSupplier = { disconnect: true }
      }
    }

    if (dto.vehiclePlate !== undefined) {
      data.vehiclePlate = dto.vehiclePlate?.trim() || null
    }

    if (dto.contactPhone !== undefined) {
      data.contactPhone = dto.contactPhone?.trim() || null
    }

    let startDate = departure.startDate
    let endDate = departure.endDate

    if (dto.startDate !== undefined) {
      startDate = parseDateOnly(dto.startDate)
    }

    if (dto.endDate !== undefined) {
      endDate = parseDateOnly(dto.endDate)
    }

    if (dto.startDate !== undefined || dto.endDate !== undefined) {
      if (endDate < startDate) {
        throw new BadRequestException('结束日期不能早于出团日期')
      }
      data.startDate = startDate
      data.endDate = endDate
      data.dayCount = computeDayCount(startDate, endDate)
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.startDate !== undefined || dto.endDate !== undefined) {
        await this.assertNoOutOfRangeItinerarySegments(tx, departure.id, startDate, endDate)
      }

      const next = await tx.departure.update({
        where: { id: departure.id },
        data,
      })

      if (dto.startDate !== undefined || dto.endDate !== undefined) {
        await fillMissingDailySkeletonInTx(tx, departure.id, startDate, endDate)
      }

      return next
    })

    return this.toDepartureDetailAsync(updated)
  }

  private async assertNoOutOfRangeItinerarySegments(
    tx: Prisma.TransactionClient,
    departureId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<void> {
    const periodStartDate = formatDateOnly(startDate)
    const periodEndDate = formatDateOnly(endDate)
    const existing = await tx.itinerarySegment.findMany({
      where: { departureId },
      select: { id: true, name: true, startDate: true, endDate: true },
    })
    const outOfRange = listOutOfRangeItinerarySegments(
      periodStartDate,
      periodEndDate,
      existing.map((segment) => ({
        id: segment.id,
        name: segment.name,
        startDate: segment.startDate ? formatDateOnly(segment.startDate) : null,
        endDate: segment.endDate ? formatDateOnly(segment.endDate) : null,
      })),
    )
    if (outOfRange.length === 0) {
      return
    }

    const conflict = buildOutOfRangeItinerarySegmentConflict(
      periodStartDate,
      periodEndDate,
      outOfRange,
    )
    throw new ConflictException({
      message: formatOutOfRangeItinerarySegmentSummary(conflict),
      data: conflict,
    })
  }

  async registerFormalAttachment(
    organizationId: string,
    userId: string,
    departureId: string,
    dto: RegisterDepartureAttachmentDto,
  ): Promise<FormalDepartureAttachmentView> {
    await this.findDepartureOrThrow(organizationId, departureId)
    const source = await this.prisma.conversationSource.findFirst({
      where: {
        id: dto.sourceId,
        organizationId,
        conversation: { creatorUserId: userId },
      },
      include: {
        parseRuns: {
          where: { resultVersion: dto.parseVersion, status: 'succeeded' },
          take: 1,
        },
      },
    })
    if (!source || source.parseRuns.length === 0) {
      throw new NotFoundException('会话来源或冻结解析版本不存在')
    }
    const used = await this.prisma.inputBatchSource.findFirst({
      where: {
        organizationId,
        sourceId: source.id,
        parseVersion: dto.parseVersion,
        inputBatch: { conversationId: source.conversationId },
      },
      select: { id: true },
    })
    if (!used) {
      throw new BadRequestException('只能登记已被输入批次冻结使用的来源版本')
    }
    const existing = await this.prisma.departureMaterial.findUnique({
      where: {
        departureId_sourceId: {
          departureId,
          sourceId: source.id,
        },
      },
    })
    if (existing) {
      return toFormalAttachmentView(existing)
    }
    const created = await this.prisma.departureMaterial.create({
      data: {
        organizationId,
        departureId,
        sourceId: source.id,
        storedObjectId: source.storedObjectId,
        originalFilename: source.originalFilename,
        contentType: source.contentType,
        sizeBytes: source.sizeBytes,
        sha256: source.sha256,
        parseVersion: dto.parseVersion,
        contentDigest: source.sha256,
        createdByUserId: userId,
      },
    })
    return toFormalAttachmentView(created)
  }

  async listFormalAttachments(
    organizationId: string,
    departureId: string,
  ): Promise<FormalDepartureAttachmentView[]> {
    await this.findDepartureOrThrow(organizationId, departureId)
    const attachments = await this.prisma.departureMaterial.findMany({
      where: { organizationId, departureId },
      orderBy: { createdAt: 'asc' },
    })
    return attachments.map(toFormalAttachmentView)
  }

  /**
   * Departure Purge：物理删除无客源、无任何财务痕迹的编辑中/待结算发团。
   * @see docs/adr/0028-departure-purge-for-empty-shells.md
   */
  async purge(organizationId: string, departureId: string): Promise<void> {
    const departure = await this.findDepartureOrThrow(organizationId, departureId)
    await this.assertPurgeAllowed(organizationId, departure)

    await this.prisma.departure.delete({ where: { id: departure.id } })
  }

  async transition(
    organizationId: string,
    departureId: string,
    dto: TransitionDepartureDto,
  ): Promise<DepartureDetail> {
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT id
        FROM departures
        WHERE id = ${departureId}
          AND organization_id = ${organizationId}
        FOR UPDATE
      `
      const departure = await tx.departure.findFirst({
        where: { id: departureId, organizationId },
      })
      if (!departure) {
        throw new NotFoundException('发团不存在')
      }

      this.departureFinanceFacade.assertMutable(departure, '变更状态')

      const allowedTargets = TRANSITION_TARGETS[departure.status] ?? []
      if (!allowedTargets.includes(dto.targetStatus)) {
        throw new BadRequestException('不允许的状态转换')
      }

      if (
        dto.targetStatus === DepartureStatus.settled &&
        departure.status === DepartureStatus.pending_settlement
      ) {
        const readModel = await this.departureReadModelService.getForDeparture(
          organizationId,
          departure.id,
          { includeOverviewStats: false },
        )
        if (!readModel.isFinanciallySettled) {
          throw new BadRequestException('全部账款尚未结清，不可标记为已结清')
        }
      }

      return tx.departure.update({
        where: { id: departure.id },
        data: { status: dto.targetStatus },
      })
    })

    return this.toDepartureDetailAsync(updated)
  }

  async close(
    organizationId: string,
    departureId: string,
    operatedBy: string,
    dto: CloseDepartureDto,
  ): Promise<DepartureDetail> {
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT id
        FROM departures
        WHERE id = ${departureId}
          AND organization_id = ${organizationId}
        FOR UPDATE
      `
      const departure = await tx.departure.findFirst({
        where: { id: departureId, organizationId },
      })
      if (!departure) {
        throw new NotFoundException('发团不存在')
      }
      if (departure.status === DepartureStatus.closed) {
        throw new BadRequestException('发团已关闭')
      }

      const closed = await tx.departure.update({
        where: { id: departure.id },
        data: { status: DepartureStatus.closed },
      })

      await tx.departureArchiveHistory.create({
        data: {
          organizationId,
          departureId: departure.id,
          action: DepartureArchiveAction.archive,
          reason: dto.reason,
          operatedBy,
        },
      })

      return closed
    })

    return this.toDepartureDetailAsync(updated)
  }

  async unarchive(
    organizationId: string,
    departureId: string,
    operatedBy: string,
    dto: UnarchiveDepartureDto,
  ): Promise<DepartureDetail> {
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT id
        FROM departures
        WHERE id = ${departureId}
          AND organization_id = ${organizationId}
        FOR UPDATE
      `
      const departure = await tx.departure.findFirst({
        where: { id: departureId, organizationId },
      })
      if (!departure) {
        throw new NotFoundException('发团不存在')
      }
      if (departure.status !== DepartureStatus.closed) {
        throw new BadRequestException('仅已关闭发团可以解除归档')
      }

      const reopened = await tx.departure.update({
        where: { id: departure.id },
        data: { status: DepartureStatus.pending_settlement },
      })

      await tx.departureArchiveHistory.create({
        data: {
          organizationId,
          departureId: departure.id,
          action: DepartureArchiveAction.unarchive,
          reason: dto.reason,
          operatedBy,
        },
      })

      return reopened
    })

    return this.toDepartureDetailAsync(updated)
  }

  private async enrichSummaries(departures: Departure[]): Promise<DepartureSummary[]> {
    if (departures.length === 0) {
      return []
    }

    const organizationId = departures[0].organizationId
    const departureIds = departures.map((departure) => departure.id)
    const ownerUserIds = departures.map((departure) => departure.ownerUserId)
    const [readModelMap, ownerNameMap, financeTouchedIds, incomeRecordDepartureIds] =
      await Promise.all([
      this.departureReadModelService.batchGetForDepartures(organizationId, departureIds),
      this.departureReadModelService.batchGetOwnerNames(ownerUserIds),
      this.batchGetFinanceTouchedDepartureIds(organizationId, departureIds),
      this.batchGetIncomeRecordDepartureIds(organizationId, departureIds),
    ])

    return departures.map((departure) => {
      const readModel = readModelMap.get(departure.id) ?? emptyDepartureReadModelAggregate()
      return this.toDepartureSummary(
        departure,
        readModel,
        ownerNameMap.get(departure.ownerUserId),
        this.computeCanPurge(
          departure,
          readModel.sourceOrderCount,
          financeTouchedIds.has(departure.id),
          incomeRecordDepartureIds.has(departure.id),
        ),
      )
    })
  }

  private async toDepartureDetailAsync(departure: Departure): Promise<DepartureDetail> {
    const [
      readModel,
      ownerNameMap,
      archiveHistory,
      settlementHistory,
      financeTouchedIds,
      incomeRecordDepartureIds,
      crewSupplierNameMap,
    ] =
      await Promise.all([
        this.departureReadModelService.getForDeparture(departure.organizationId, departure.id),
        this.departureReadModelService.batchGetOwnerNames([departure.ownerUserId]),
        this.loadArchiveHistory(departure.id),
        this.loadSettlementHistory(departure.id),
        this.batchGetFinanceTouchedDepartureIds(departure.organizationId, [departure.id]),
        this.batchGetIncomeRecordDepartureIds(departure.organizationId, [departure.id]),
        this.batchGetCrewSupplierNames(departure.organizationId, [departure]),
      ])
    return this.toDepartureDetail(
      departure,
      readModel,
      ownerNameMap.get(departure.ownerUserId),
      archiveHistory,
      settlementHistory,
      this.computeCanPurge(
        departure,
        readModel.sourceOrderCount,
        financeTouchedIds.has(departure.id),
        incomeRecordDepartureIds.has(departure.id),
      ),
      crewSupplierNameMap,
    )
  }

  private async batchGetCrewSupplierNames(
    organizationId: string,
    departures: Departure[],
  ): Promise<Map<string, string>> {
    const supplierIds = [
      ...new Set(
        departures.flatMap((departure) =>
          [departure.driverSupplierId, departure.guideSupplierId].filter(
            (id): id is string => Boolean(id),
          ),
        ),
      ),
    ]
    if (supplierIds.length === 0) {
      return new Map()
    }

    const suppliers = await this.prisma.supplier.findMany({
      where: { organizationId, id: { in: supplierIds } },
      select: { id: true, name: true },
    })
    return new Map(suppliers.map((supplier) => [supplier.id, supplier.name]))
  }

  private async batchGetFinanceTouchedDepartureIds(
    organizationId: string,
    departureIds: string[],
  ): Promise<Set<string>> {
    if (departureIds.length === 0) {
      return new Set()
    }

    const [schedules, transactions] = await Promise.all([
      this.prisma.paymentSchedule.findMany({
        where: { organizationId, departureId: { in: departureIds } },
        select: { departureId: true },
        distinct: ['departureId'],
      }),
      this.prisma.financeTransaction.findMany({
        where: { organizationId, departureId: { in: departureIds } },
        select: { departureId: true },
        distinct: ['departureId'],
      }),
    ])

    const touched = new Set<string>()
    for (const row of schedules) {
      touched.add(row.departureId)
    }
    for (const row of transactions) {
      if (row.departureId) {
        touched.add(row.departureId)
      }
    }
    return touched
  }

  private async batchGetIncomeRecordDepartureIds(
    organizationId: string,
    departureIds: string[],
  ): Promise<Set<string>> {
    if (departureIds.length === 0) {
      return new Set()
    }
    const rows = await this.prisma.departureIncomeRecord.findMany({
      where: {
        departureId: { in: departureIds },
        departure: { organizationId },
      },
      select: { departureId: true },
      distinct: ['departureId'],
    })
    return new Set(rows.map((row) => row.departureId))
  }

  private computeCanPurge(
    departure: Pick<Departure, 'status'>,
    sourceOrderCount: number,
    hasFinanceTouch: boolean,
    hasIncomeRecord: boolean,
  ): boolean {
    if (!PURGEABLE_STATUSES.includes(departure.status)) {
      return false
    }
    return sourceOrderCount === 0 && !hasFinanceTouch && !hasIncomeRecord
  }

  private async assertPurgeAllowed(organizationId: string, departure: Departure): Promise<void> {
    if (!PURGEABLE_STATUSES.includes(departure.status)) {
      throw new ConflictException('已结清或已关闭的发团不能删除，请使用关闭/解除归档')
    }

    const [sourceOrderCount, scheduleCount, transactionCount, incomeRecordCount] =
      await Promise.all([
      this.prisma.sourceOrder.count({ where: { departureId: departure.id } }),
      this.prisma.paymentSchedule.count({
        where: { organizationId, departureId: departure.id },
      }),
      this.prisma.financeTransaction.count({
        where: { organizationId, departureId: departure.id },
      }),
      this.prisma.departureIncomeRecord.count({ where: { departureId: departure.id } }),
    ])

    if (sourceOrderCount > 0) {
      throw new ConflictException('已有客源单，不能删除发团')
    }
    if (scheduleCount > 0) {
      throw new ConflictException('已有收付款节点，不能删除发团')
    }
    if (transactionCount > 0) {
      throw new ConflictException('已有归属本团的收支流水，不能删除发团')
    }
    if (incomeRecordCount > 0) {
      throw new ConflictException('已有增收记录，不能删除发团')
    }
  }

  private async loadArchiveHistory(departureId: string): Promise<DepartureArchiveHistoryItem[]> {
    const rows = await this.prisma.departureArchiveHistory.findMany({
      where: { departureId },
      orderBy: { operatedAt: 'asc' },
      include: {
        operator: {
          select: { name: true },
        },
      },
    })

    return rows.map((row) => this.toArchiveHistoryItem(row))
  }

  private async loadSettlementHistory(
    departureId: string,
  ): Promise<DepartureSettlementHistoryItem[]> {
    const rows = await this.prisma.departureSettlementHistory.findMany({
      where: { departureId },
      orderBy: { operatedAt: 'asc' },
      include: {
        operator: { select: { name: true } },
        triggerPaymentSchedule: { select: { scheduleNo: true } },
      },
    })
    return rows.map((row) => this.toSettlementHistoryItem(row))
  }

  private toArchiveHistoryItem(
    row: DepartureArchiveHistory & { operator: { name: string } },
  ): DepartureArchiveHistoryItem {
    return {
      id: row.id,
      action: row.action,
      reason: row.reason,
      operatedBy: row.operatedBy,
      operatedByName: row.operator.name,
      operatedAt: row.operatedAt.toISOString(),
    }
  }

  private toSettlementHistoryItem(
    row: DepartureSettlementHistory & {
      operator: { name: string }
      triggerPaymentSchedule: { scheduleNo: string }
    },
  ): DepartureSettlementHistoryItem {
    return {
      id: row.id,
      triggerPaymentScheduleId: row.triggerPaymentScheduleId,
      triggerScheduleNo: row.triggerPaymentSchedule.scheduleNo,
      reason: row.reason,
      previousStatus: row.previousStatus,
      newStatus: row.newStatus,
      operatedBy: row.operatedBy,
      operatedByName: row.operator.name,
      operatedAt: row.operatedAt.toISOString(),
    }
  }

  private hasUpdateFields(dto: UpdateDepartureDto): boolean {
    return UPDATE_DEPARTURE_FIELDS.some((field) => dto[field] !== undefined)
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

  private async ensureOwnerInOrganization(organizationId: string, ownerUserId: string) {
    const owner = await this.prisma.user.findFirst({
      where: {
        id: ownerUserId,
        organizationId,
        deletedAt: null,
      },
    })

    if (!owner) {
      throw new BadRequestException('负责人不存在或不属于当前企业')
    }
  }

  private async ensureCrewSupplier(
    organizationId: string,
    supplierId: string,
    requiredCategory: ResourceKind,
    categoryError: string,
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
    if (!supplier.categories.includes(requiredCategory)) {
      throw new BadRequestException(categoryError)
    }
  }

  private toDepartureDetail(
    departure: Departure,
    readModel: DepartureReadModelAggregate,
    ownerName: string | undefined,
    archiveHistory: DepartureArchiveHistoryItem[],
    settlementHistory: DepartureSettlementHistoryItem[],
    canPurge: boolean,
    crewSupplierNameMap: Map<string, string>,
  ): DepartureDetail {
    return {
      ...this.toDepartureSummary(departure, readModel, ownerName, canPurge),
      driverSupplierId: departure.driverSupplierId,
      driverSupplierName: departure.driverSupplierId
        ? crewSupplierNameMap.get(departure.driverSupplierId) ?? null
        : null,
      guideSupplierId: departure.guideSupplierId,
      guideSupplierName: departure.guideSupplierId
        ? crewSupplierNameMap.get(departure.guideSupplierId) ?? null
        : null,
      vehiclePlate: departure.vehiclePlate,
      contactPhone: departure.contactPhone,
      grossReceivableCents: readModel.grossReceivableCents,
      fareAdjustmentNetCents: readModel.fareAdjustmentNetCents,
      discountCents: readModel.discountCents,
      verifiedReceivableCents: readModel.verifiedReceivableCents,
      openUnsettledReceivableCents: readModel.openUnsettledReceivableCents,
      verifiedPayableCents: readModel.verifiedPayableCents,
      openUnsettledPayableCents: readModel.openUnsettledPayableCents,
      unverifiedIncomeCents: readModel.unverifiedIncomeCents,
      unverifiedExpenseCents: readModel.unverifiedExpenseCents,
      overviewStats: readModel.overviewStats,
      isFinanciallySettled: readModel.isFinanciallySettled,
      archiveHistory,
      settlementHistory,
    }
  }

  private toDepartureSummary(
    departure: Departure,
    readModel: DepartureReadModelAggregate = emptyDepartureReadModelAggregate(),
    ownerName?: string,
    canPurge = false,
  ): DepartureSummary {
    return {
      id: departure.id,
      departureNo: departure.departureNo,
      name: departure.name,
      routeName: departure.routeName,
      routeSource: departure.routeSource,
      sourceTemplateId: departure.sourceTemplateId,
      departureType: departure.departureType,
      startDate: formatDateOnly(departure.startDate),
      endDate: formatDateOnly(departure.endDate),
      dayCount: departure.dayCount,
      ownerUserId: departure.ownerUserId,
      ...(ownerName ? { ownerName } : {}),
      status: departure.status,
      departureProgress: deriveDepartureProgress(departure.startDate, departure.endDate),
      notes: departure.notes,
      createdAt: departure.createdAt.toISOString(),
      updatedAt: departure.updatedAt.toISOString(),
      totalGuests: readModel.totalGuests,
      sourceOrderCount: readModel.sourceOrderCount,
      segmentCount: readModel.segmentCount,
      resourceCount: readModel.resourceCount,
      completionTags: readModel.completionTags,
      netReceivableCents: readModel.netReceivableCents,
      payableCents: readModel.payableCents,
      estimatedMarginCents: readModel.estimatedMarginCents,
      canPurge,
    }
  }
}

function toFormalAttachmentView(attachment: {
  id: string
  departureId: string
  sourceId: string | null
  originalFilename: string
  contentType: string
  sha256: string
  sizeBytes: number
  parseVersion: number | null
  contentDigest: string
  createdAt: Date
}): FormalDepartureAttachmentView {
  return {
    id: attachment.id,
    departureId: attachment.departureId,
    sourceId: attachment.sourceId,
    originalFilename: attachment.originalFilename,
    contentType: attachment.contentType,
    sha256: attachment.sha256,
    sizeBytes: attachment.sizeBytes,
    parseVersion: attachment.parseVersion,
    contentDigest: attachment.contentDigest,
    createdAt: attachment.createdAt.toISOString(),
  }
}

function emptyRouteLedgerTotals(): RouteLedgerTotals {
  return {
    orderCount: 0,
    guestCount: 0,
    grossReceivableCents: 0,
    netReceivableCents: 0,
    partnerCollectedCents: 0,
    guestCollectCents: 0,
  }
}

function emptyRouteLedgerOutsourceSummary(): RouteLedgerOutsourceSummary {
  return { totalAmountCents: 0, items: [] }
}

function toRouteLedgerOutsourceSummary(
  items: RouteLedgerOutsourceLine[],
): RouteLedgerOutsourceSummary {
  return {
    totalAmountCents: items.reduce((sum, item) => sum + item.amountCents, 0),
    items,
  }
}

function sumRouteLedgerRows(rows: RouteLedgerSourceOrderRow[]): RouteLedgerTotals {
  return rows.reduce<RouteLedgerTotals>(
    (acc, row) => ({
      orderCount: acc.orderCount + 1,
      guestCount: acc.guestCount + row.guestCount,
      grossReceivableCents: acc.grossReceivableCents + row.grossReceivableCents,
      netReceivableCents: acc.netReceivableCents + row.netReceivableCents,
      partnerCollectedCents: acc.partnerCollectedCents + row.partnerCollectedCents,
      guestCollectCents: acc.guestCollectCents + row.guestCollectCents,
    }),
    emptyRouteLedgerTotals(),
  )
}

function sumRouteLedgerTotals(items: RouteLedgerTotals[]): RouteLedgerTotals {
  return items.reduce<RouteLedgerTotals>(
    (acc, item) => ({
      orderCount: acc.orderCount + item.orderCount,
      guestCount: acc.guestCount + item.guestCount,
      grossReceivableCents: acc.grossReceivableCents + item.grossReceivableCents,
      netReceivableCents: acc.netReceivableCents + item.netReceivableCents,
      partnerCollectedCents: acc.partnerCollectedCents + item.partnerCollectedCents,
      guestCollectCents: acc.guestCollectCents + item.guestCollectCents,
    }),
    emptyRouteLedgerTotals(),
  )
}
