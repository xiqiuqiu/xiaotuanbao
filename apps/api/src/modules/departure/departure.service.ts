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
import { RouteTemplateCopyService } from './route-template-copy.service'
import { RouteTemplateService } from './route-template.service'

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
}

@Injectable()
export class DepartureService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly routeTemplateService: RouteTemplateService,
    private readonly routeTemplateCopyService: RouteTemplateCopyService,
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

    let summaries = items.map((departure) => this.toDepartureSummary(departure))

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

    return this.toDepartureSummary(departure)
  }

  async getById(organizationId: string, departureId: string): Promise<DepartureDetail> {
    const departure = await this.findDepartureOrThrow(organizationId, departureId)
    return this.toDepartureDetail(departure)
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

    return this.toDepartureDetail(updated)
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

    const updated = await this.prisma.departure.update({
      where: { id: departure.id },
      data: { status: dto.targetStatus },
    })

    return this.toDepartureDetail(updated)
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

    return this.toDepartureDetail(updated)
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

  private toDepartureDetail(departure: Departure): DepartureDetail {
    return {
      ...this.toDepartureSummary(departure),
      totalGuests: 0,
      grossReceivableCents: 0,
      discountCents: 0,
      netReceivableCents: 0,
      payableCents: 0,
      estimatedMarginCents: 0,
      collectedCents: 0,
      uncollectedCents: 0,
      paidCents: 0,
      unpaidCents: 0,
    }
  }

  private toDepartureSummary(departure: Departure): DepartureSummary {
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
      status: departure.status,
      departureProgress: deriveDepartureProgress(departure.startDate, departure.endDate),
      notes: departure.notes,
      createdAt: departure.createdAt.toISOString(),
      updatedAt: departure.updatedAt.toISOString(),
    }
  }
}
