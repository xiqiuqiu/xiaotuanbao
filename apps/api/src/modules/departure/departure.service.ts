import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import type { DepartureDetail, DepartureListResult, DepartureSummary } from '@xiaotuanbao/shared'
import {
  DepartureRouteSource,
  DepartureStatus,
  DepartureType,
  type Departure,
  type Prisma,
} from '@prisma/client'
import { PrismaService } from '../../database/prisma/prisma.service'
import type {
  CreateDepartureDto,
  CopyDepartureDto,
  ListDeparturesQueryDto,
  TransitionDepartureDto,
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

const UPDATE_DEPARTURE_FIELDS = [
  'departureNo',
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

@Injectable()
export class DepartureService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly routeTemplateService: RouteTemplateService,
    private readonly routeTemplateCopyService: RouteTemplateCopyService,
    private readonly departureCopyService: DepartureCopyService,
    private readonly departureReadModelService: DepartureReadModelService,
  ) {}

  async list(
    organizationId: string,
    query: ListDeparturesQueryDto,
  ): Promise<DepartureListResult> {
    const page = Math.max(Number(query.page) || 1, 1)
    const pageSize = Math.min(Math.max(Number(query.pageSize) || 10, 1), 100)
    const keyword = query.keyword?.trim()

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

    const [items, total] = await Promise.all([
      this.prisma.departure.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.departure.count({ where }),
    ])

    let summaries = await this.enrichSummaries(items)

    if (query.departureProgress) {
      summaries = summaries.filter((item) => item.departureProgress === query.departureProgress)
    }

    return {
      items: summaries,
      total: query.departureProgress ? summaries.length : total,
      page,
      pageSize,
    }
  }

  async previewNextDepartureNo(
    organizationId: string,
    startDateStr: string,
  ): Promise<{ departureNo: string }> {
    const startDate = parseDateOnly(startDateStr)
    const departureNo = await this.generateDepartureNo(organizationId, startDate)
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

    const departureNo =
      dto.departureNo?.trim() ||
      (await this.generateDepartureNo(organizationId, startDate))

    await this.ensureDepartureNoAvailable(organizationId, departureNo)

    const dayCount = computeDayCount(startDate, endDate)

    const departure = await this.prisma.$transaction(async (tx) => {
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
          flags: {
            copySegments: dto.copySegments,
            copyResources: dto.copyResources,
            copyReferencePrices: dto.copyReferencePrices,
          },
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

    const departureNo =
      dto.departureNo?.trim() ||
      (await this.generateDepartureNo(organizationId, startDate))

    await this.ensureDepartureNoAvailable(organizationId, departureNo)

    const dayCount = computeDayCount(startDate, endDate)

    const departure = await this.prisma.$transaction(async (tx) => {
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
        flags: {
          copySegments: dto.copySegments,
          copyResources: dto.copyResources,
          copyReferencePrices: dto.copyReferencePrices,
        },
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

    if (departure.status === DepartureStatus.closed) {
      throw new ConflictException('发团已关闭，不可编辑')
    }

    if (!this.hasUpdateFields(dto)) {
      throw new BadRequestException('请至少提供一个待更新字段')
    }

    const data: Prisma.DepartureUpdateInput = {}

    if (dto.departureNo !== undefined) {
      const departureNo = dto.departureNo.trim()
      if (!departureNo) {
        throw new BadRequestException('团号不能为空')
      }
      await this.ensureDepartureNoAvailable(organizationId, departureNo, departure.id)
      data.departureNo = departureNo
    }

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

  async transition(
    organizationId: string,
    departureId: string,
    dto: TransitionDepartureDto,
  ): Promise<DepartureDetail> {
    const departure = await this.findDepartureOrThrow(organizationId, departureId)

    if (departure.status === DepartureStatus.closed) {
      throw new BadRequestException('已关闭发团不可变更状态')
    }

    const allowedTargets = TRANSITION_TARGETS[departure.status] ?? []
    if (!allowedTargets.includes(dto.targetStatus)) {
      throw new BadRequestException('不允许的状态转换')
    }

    if (
      dto.targetStatus === DepartureStatus.settled &&
      departure.status === DepartureStatus.pending_settlement
    ) {
      const readModel = await this.departureReadModelService.getForDeparture(departure.id)
      if (!readModel.isFinanciallySettled) {
        throw new BadRequestException('全部账款尚未结清，不可标记为已结清')
      }
    }

    const updated = await this.prisma.departure.update({
      where: { id: departure.id },
      data: { status: dto.targetStatus },
    })

    return this.toDepartureDetailAsync(updated)
  }

  async close(organizationId: string, departureId: string): Promise<DepartureDetail> {
    const departure = await this.findDepartureOrThrow(organizationId, departureId)

    if (departure.status === DepartureStatus.closed) {
      throw new BadRequestException('发团已关闭')
    }

    const updated = await this.prisma.departure.update({
      where: { id: departure.id },
      data: { status: DepartureStatus.closed },
    })

    return this.toDepartureDetailAsync(updated)
  }

  private async enrichSummaries(departures: Departure[]): Promise<DepartureSummary[]> {
    if (departures.length === 0) {
      return []
    }

    const departureIds = departures.map((departure) => departure.id)
    const ownerUserIds = departures.map((departure) => departure.ownerUserId)
    const [readModelMap, ownerNameMap] = await Promise.all([
      this.departureReadModelService.batchGetForDepartures(departureIds),
      this.departureReadModelService.batchGetOwnerNames(ownerUserIds),
    ])

    return departures.map((departure) => {
      const readModel = readModelMap.get(departure.id) ?? emptyDepartureReadModelAggregate()
      return this.toDepartureSummary(departure, readModel, ownerNameMap.get(departure.ownerUserId))
    })
  }

  private async toDepartureDetailAsync(departure: Departure): Promise<DepartureDetail> {
    const readModel = await this.departureReadModelService.getForDeparture(departure.id)
    return this.toDepartureDetail(departure, readModel)
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

  private async ensureDepartureNoAvailable(
    organizationId: string,
    departureNo: string,
    excludeId?: string,
  ) {
    const existing = await this.prisma.departure.findFirst({
      where: {
        organizationId,
        departureNo,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    })

    if (existing) {
      throw new ConflictException('团号已存在')
    }
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

  private async generateDepartureNo(organizationId: string, startDate: Date): Promise<string> {
    const datePart = formatDateOnly(startDate).replace(/-/g, '')
    const prefix = `DT${datePart}`

    const count = await this.prisma.departure.count({
      where: {
        organizationId,
        departureNo: { startsWith: prefix },
      },
    })

    return `${prefix}${String(count + 1).padStart(4, '0')}`
  }

  private toDepartureDetail(
    departure: Departure,
    readModel: DepartureReadModelAggregate,
  ): DepartureDetail {
    return {
      ...this.toDepartureSummary(departure, readModel),
      grossReceivableCents: readModel.grossReceivableCents,
      discountCents: readModel.discountCents,
      collectedCents: readModel.collectedCents,
      uncollectedCents: readModel.uncollectedCents,
      paidCents: readModel.paidCents,
      unpaidCents: readModel.unpaidCents,
      isFinanciallySettled: readModel.isFinanciallySettled,
    }
  }

  private toDepartureSummary(
    departure: Departure,
    readModel: DepartureReadModelAggregate = emptyDepartureReadModelAggregate(),
    ownerName?: string,
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
    }
  }
}
