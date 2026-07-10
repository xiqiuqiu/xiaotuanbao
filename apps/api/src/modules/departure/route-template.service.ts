import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../database/prisma/prisma.service'
import type { CreateRouteTemplateDto } from './dto/route-template.dto'

export interface RouteTemplateCardSummary {
  id: string
  name: string
  defaultDayCount: number
  usageCount: number
  updatedAt: string
}

export interface RouteTemplateDetailSummary extends RouteTemplateCardSummary {
  segmentCount: number
  resourceCount: number
}

@Injectable()
export class RouteTemplateService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    organizationId: string,
    keyword?: string,
  ): Promise<RouteTemplateCardSummary[]> {
    const trimmedKeyword = keyword?.trim()

    const templates = await this.prisma.routeTemplate.findMany({
      where: {
        organizationId,
        ...(trimmedKeyword
          ? { name: { contains: trimmedKeyword, mode: 'insensitive' } }
          : {}),
      },
      orderBy: { updatedAt: 'desc' },
    })

    return templates.map((template) => this.toCardSummary(template))
  }

  async getById(organizationId: string, id: string): Promise<RouteTemplateDetailSummary> {
    const template = await this.prisma.routeTemplate.findFirst({
      where: { id, organizationId },
      include: {
        segments: {
          include: {
            resources: true,
          },
        },
      },
    })

    if (!template) {
      throw new NotFoundException('常用路线不存在')
    }

    const segmentCount = template.segments.length
    const resourceCount = template.segments.reduce(
      (total, segment) => total + segment.resources.length,
      0,
    )

    return {
      ...this.toCardSummary(template),
      segmentCount,
      resourceCount,
    }
  }

  async create(
    organizationId: string,
    dto: CreateRouteTemplateDto,
  ): Promise<RouteTemplateDetailSummary> {
    const name = dto.name.trim()
    await this.ensureNameAvailable(organizationId, name)

    let template
    try {
      template = await this.prisma.routeTemplate.create({
        data: {
          organizationId,
          name,
          defaultDayCount: dto.defaultDayCount,
          notes: dto.notes?.trim() || null,
          segments: dto.segments?.length
            ? {
                create: dto.segments.map((segment) => ({
                  sortOrder: segment.sortOrder,
                  name: segment.name.trim(),
                  dayCount: segment.dayCount ?? null,
                  destination: segment.destination?.trim() || null,
                  notes: segment.notes?.trim() || null,
                  resources: segment.resources?.length
                    ? {
                        create: segment.resources.map((resource) => ({
                          resourceKind: resource.resourceKind,
                          counterpartyType: resource.counterpartyType,
                          partnerId: resource.partnerId ?? null,
                          supplierId: resource.supplierId ?? null,
                          title: resource.title.trim(),
                          amountCents: 0,
                          notes: resource.notes?.trim() || null,
                        })),
                      }
                    : undefined,
                })),
              }
            : undefined,
        },
        include: {
          segments: {
            include: {
              resources: true,
            },
          },
        },
      })
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('常用路线名称已存在，请改名后另存')
      }
      throw error
    }

    const segmentCount = template.segments.length
    const resourceCount = template.segments.reduce(
      (total, segment) => total + segment.resources.length,
      0,
    )

    return {
      ...this.toCardSummary(template),
      segmentCount,
      resourceCount,
    }
  }

  async findForCopy(organizationId: string, templateId: string) {
    const template = await this.prisma.routeTemplate.findFirst({
      where: { id: templateId, organizationId },
      include: {
        segments: {
          orderBy: { sortOrder: 'asc' },
          include: {
            resources: true,
          },
        },
      },
    })

    if (!template) {
      throw new NotFoundException('常用路线不存在')
    }

    return template
  }

  async remove(organizationId: string, id: string): Promise<void> {
    const result = await this.prisma.routeTemplate.deleteMany({
      where: { id, organizationId },
    })

    if (result.count === 0) {
      throw new NotFoundException('常用路线不存在')
    }
  }

  private async ensureNameAvailable(organizationId: string, name: string) {
    const existing = await this.prisma.routeTemplate.findFirst({
      where: { organizationId, name },
    })

    if (existing) {
      throw new ConflictException('常用路线名称已存在，请改名后另存')
    }
  }

  private toCardSummary(template: {
    id: string
    name: string
    defaultDayCount: number
    usageCount: number
    updatedAt: Date
  }): RouteTemplateCardSummary {
    return {
      id: template.id,
      name: template.name,
      defaultDayCount: template.defaultDayCount,
      usageCount: template.usageCount,
      updatedAt: template.updatedAt.toISOString(),
    }
  }
}
