import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import type {
  DepartureArchiveHistoryItem,
  DepartureDetail,
  DepartureListResult,
  DepartureSettlementHistoryItem,
  DepartureSummary,
} from '@xiaotuanbao/shared'
import {
  DepartureArchiveAction,
  DepartureRouteSource,
  DepartureStatus,
  DepartureType,
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
  TransitionDepartureDto,
  UnarchiveDepartureDto,
  UpdateDepartureDto,
} from './dto/departure.dto'
import {
  computeDayCount,
  deriveDepartureProgress,
  formatDateOnly,
  parseDateOnly,
} from './departure-date.utils'
import { DepartureCopyService } from './departure-copy.service'
import { RouteTemplateCopyService } from './route-template-copy.service'
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

    const dayCount = computeDayCount(startDate, endDate)

    const departure = await this.prisma.$transaction(async (tx) => {
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

      return created
    })

    const [summary] = await this.enrichSummaries([departure])
    return summary
  }

  async copy(
    organizationId: string,
    sourceDepartureId: string,
    dto: CopyDepartureDto,
  ): Promise<DepartureSummary> {
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

    const departure = await this.prisma.$transaction(async (tx) => {
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

      return created
    })

    const [summary] = await this.enrichSummaries([departure])
    return summary
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

    const updated = await this.prisma.departure.update({
      where: { id: departure.id },
      data,
    })

    return this.toDepartureDetailAsync(updated)
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
    const [readModelMap, ownerNameMap, financeTouchedIds] = await Promise.all([
      this.departureReadModelService.batchGetForDepartures(organizationId, departureIds),
      this.departureReadModelService.batchGetOwnerNames(ownerUserIds),
      this.batchGetFinanceTouchedDepartureIds(organizationId, departureIds),
    ])

    return departures.map((departure) => {
      const readModel = readModelMap.get(departure.id) ?? emptyDepartureReadModelAggregate()
      return this.toDepartureSummary(
        departure,
        readModel,
        ownerNameMap.get(departure.ownerUserId),
        this.computeCanPurge(departure, readModel.sourceOrderCount, financeTouchedIds.has(departure.id)),
      )
    })
  }

  private async toDepartureDetailAsync(departure: Departure): Promise<DepartureDetail> {
    const [readModel, ownerNameMap, archiveHistory, settlementHistory, financeTouchedIds] =
      await Promise.all([
        this.departureReadModelService.getForDeparture(departure.organizationId, departure.id),
        this.departureReadModelService.batchGetOwnerNames([departure.ownerUserId]),
        this.loadArchiveHistory(departure.id),
        this.loadSettlementHistory(departure.id),
        this.batchGetFinanceTouchedDepartureIds(departure.organizationId, [departure.id]),
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
      ),
    )
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

  private computeCanPurge(
    departure: Pick<Departure, 'status'>,
    sourceOrderCount: number,
    hasFinanceTouch: boolean,
  ): boolean {
    if (!PURGEABLE_STATUSES.includes(departure.status)) {
      return false
    }
    return sourceOrderCount === 0 && !hasFinanceTouch
  }

  private async assertPurgeAllowed(organizationId: string, departure: Departure): Promise<void> {
    if (!PURGEABLE_STATUSES.includes(departure.status)) {
      throw new ConflictException('已结清或已关闭的发团不能删除，请使用关闭/解除归档')
    }

    const [sourceOrderCount, scheduleCount, transactionCount] = await Promise.all([
      this.prisma.sourceOrder.count({ where: { departureId: departure.id } }),
      this.prisma.paymentSchedule.count({
        where: { organizationId, departureId: departure.id },
      }),
      this.prisma.financeTransaction.count({
        where: { organizationId, departureId: departure.id },
      }),
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

  private toDepartureDetail(
    departure: Departure,
    readModel: DepartureReadModelAggregate,
    ownerName: string | undefined,
    archiveHistory: DepartureArchiveHistoryItem[],
    settlementHistory: DepartureSettlementHistoryItem[],
    canPurge: boolean,
  ): DepartureDetail {
    return {
      ...this.toDepartureSummary(departure, readModel, ownerName, canPurge),
      grossReceivableCents: readModel.grossReceivableCents,
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
