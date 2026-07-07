import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common'
import type { DepartureListResult, DepartureSummary } from '@xiaotuanbao/shared'
import {
  DepartureRouteSource,
  DepartureStatus,
  DepartureType,
  type Departure,
  type Prisma,
} from '@prisma/client'
import { PrismaService } from '../../database/prisma/prisma.service'
import type { CreateDepartureDto, ListDeparturesQueryDto } from './dto/departure.dto'
import {
  computeDayCount,
  deriveDepartureProgress,
  formatDateOnly,
  parseDateOnly,
} from './departure-date.utils'
import { RouteTemplateCopyService } from './route-template-copy.service'
import { RouteTemplateService } from './route-template.service'

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

  private async ensureDepartureNoAvailable(organizationId: string, departureNo: string) {
    const existing = await this.prisma.departure.findFirst({
      where: { organizationId, departureNo },
    })

    if (existing) {
      throw new ConflictException('团号已存在')
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
