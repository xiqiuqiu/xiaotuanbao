import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import type {
  ProductDetail,
  ProductListItem,
  ProductListResult,
  ProductScheduleSummary,
  ProductSpecSummary,
} from '@xiaotuanbao/shared'
import {
  ProductScheduleStatus,
  ProductStatus,
  ProductType,
  type Product,
  type ProductSchedule,
  type ProductSpec,
} from '@prisma/client'
import { PrismaService } from '../../database/prisma/prisma.service'
import { formatDateOnly, parseDateOnly } from '../departure/departure-date.utils'
import type {
  CreateProductDto,
  CreateProductScheduleDto,
  ListProductsQueryDto,
  UpdateProductDto,
  UpdateProductScheduleDto,
  UpdateProductSpecDto,
} from './dto/product.dto'

type ProductWithRelations = Product & {
  specs: ProductSpec[]
  schedules: ProductSchedule[]
}

@Injectable()
export class ProductService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    organizationId: string,
    query: ListProductsQueryDto,
  ): Promise<ProductListResult> {
    const page = Math.max(Number(query.page) || 1, 1)
    const pageSize = Math.min(Math.max(Number(query.pageSize) || 10, 1), 100)
    const search = query.search?.trim()
    const includeOffline = query.includeOffline === true

    const where = {
      organizationId,
      ...(query.status
        ? { status: query.status }
        : includeOffline
          ? {}
          : { status: { not: ProductStatus.offline } }),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              { startCity: { contains: search, mode: 'insensitive' as const } },
              { endCity: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    }

    const [rows, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: {
          schedules: { select: { status: true } },
        },
        orderBy: [{ updatedAt: 'desc' }, { name: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.product.count({ where }),
    ])

    return {
      items: rows.map((row) => this.toListItem(row)),
      total,
      page,
      pageSize,
    }
  }

  async getById(organizationId: string, productId: string): Promise<ProductDetail> {
    const product = await this.findProductOrThrow(organizationId, productId)
    return this.toDetail(product)
  }

  async create(organizationId: string, dto: CreateProductDto): Promise<ProductDetail> {
    const name = dto.name.trim()
    if (!name) {
      throw new BadRequestException('产品名称不能为空')
    }

    const product = await this.prisma.product.create({
      data: {
        organizationId,
        name,
        productType: ProductType.group_join,
        status: ProductStatus.draft,
        shortItinerary: dto.shortItinerary?.trim() ?? '',
        startCity: dto.startCity?.trim() || null,
        endCity: dto.endCity?.trim() || null,
        dayCount: dto.dayCount ?? null,
        tags: (dto.tags ?? []).map((tag) => tag.trim()).filter(Boolean),
        specs: {
          create: {
            name: '标准',
          },
        },
      },
      include: {
        specs: true,
        schedules: { orderBy: { createdAt: 'asc' } },
      },
    })

    return this.toDetail(product)
  }

  async update(
    organizationId: string,
    productId: string,
    dto: UpdateProductDto,
  ): Promise<ProductDetail> {
    const existing = await this.findProductOrThrow(organizationId, productId)

    const nextName = dto.name !== undefined ? dto.name.trim() : existing.name
    if (!nextName) {
      throw new BadRequestException('产品名称不能为空')
    }

    const nextShortItinerary =
      dto.shortItinerary !== undefined ? dto.shortItinerary.trim() : existing.shortItinerary

    if (dto.status !== undefined && dto.status !== existing.status) {
      this.assertStatusTransition(
        {
          ...existing,
          name: nextName,
          shortItinerary: nextShortItinerary,
        },
        dto.status,
      )
    }

    const product = await this.prisma.product.update({
      where: { id: productId },
      data: {
        name: nextName,
        ...(dto.shortItinerary !== undefined ? { shortItinerary: nextShortItinerary } : {}),
        ...(dto.detailedItinerary !== undefined
          ? { detailedItinerary: normalizeNullableText(dto.detailedItinerary) }
          : {}),
        ...(dto.featuresText !== undefined
          ? { featuresText: normalizeNullableText(dto.featuresText) }
          : {}),
        ...(dto.bookingNotice !== undefined
          ? { bookingNotice: normalizeNullableText(dto.bookingNotice) }
          : {}),
        ...(dto.startCity !== undefined
          ? { startCity: normalizeNullableText(dto.startCity) }
          : {}),
        ...(dto.endCity !== undefined ? { endCity: normalizeNullableText(dto.endCity) } : {}),
        ...(dto.dayCount !== undefined ? { dayCount: dto.dayCount } : {}),
        ...(dto.tags !== undefined
          ? { tags: dto.tags.map((tag) => tag.trim()).filter(Boolean) }
          : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
      include: {
        specs: true,
        schedules: { orderBy: { createdAt: 'asc' } },
      },
    })

    return this.toDetail(product)
  }

  async updateSpec(
    organizationId: string,
    productId: string,
    dto: UpdateProductSpecDto,
  ): Promise<ProductDetail> {
    const product = await this.findProductOrThrow(organizationId, productId)
    const spec = requirePrimarySpec(product)

    await this.prisma.productSpec.update({
      where: { id: spec.id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.adultPriceCents !== undefined ? { adultPriceCents: dto.adultPriceCents } : {}),
        ...(dto.childPriceCents !== undefined ? { childPriceCents: dto.childPriceCents } : {}),
        ...(dto.singleRoomSupplementCents !== undefined
          ? { singleRoomSupplementCents: dto.singleRoomSupplementCents }
          : {}),
        ...(dto.notes !== undefined ? { notes: normalizeNullableText(dto.notes) } : {}),
      },
    })

    return this.getById(organizationId, productId)
  }

  async createSchedule(
    organizationId: string,
    productId: string,
    dto: CreateProductScheduleDto,
  ): Promise<ProductDetail> {
    const product = await this.findProductOrThrow(organizationId, productId)
    const spec = requirePrimarySpec(product)

    const priceOnInquiry = dto.priceOnInquiry === true
    const adultPriceCents =
      dto.adultPriceCents !== undefined ? dto.adultPriceCents : spec.adultPriceCents
    const childPriceCents =
      dto.childPriceCents !== undefined ? dto.childPriceCents : spec.childPriceCents
    const singleRoomSupplementCents =
      dto.singleRoomSupplementCents !== undefined
        ? dto.singleRoomSupplementCents
        : spec.singleRoomSupplementCents

    if (!priceOnInquiry && adultPriceCents == null) {
      throw new BadRequestException('班期须有成人价，或标记为询价')
    }

    await this.prisma.productSchedule.create({
      data: {
        productId,
        productSpecId: spec.id,
        title: dto.title?.trim() ?? '',
        dateRuleText: dto.dateRuleText?.trim() ?? '',
        startDate: parseOptionalDate(dto.startDate),
        endDate: parseOptionalDate(dto.endDate),
        status: dto.status ?? ProductScheduleStatus.on_sale,
        priceOnInquiry,
        adultPriceCents,
        childPriceCents,
        singleRoomSupplementCents,
        notes: normalizeNullableText(dto.notes ?? null),
      },
    })

    return this.getById(organizationId, productId)
  }

  async updateSchedule(
    organizationId: string,
    productId: string,
    scheduleId: string,
    dto: UpdateProductScheduleDto,
  ): Promise<ProductDetail> {
    await this.findProductOrThrow(organizationId, productId)
    const schedule = await this.findScheduleOrThrow(organizationId, productId, scheduleId)

    const nextPriceOnInquiry =
      dto.priceOnInquiry !== undefined ? dto.priceOnInquiry : schedule.priceOnInquiry
    const nextAdultPriceCents =
      dto.adultPriceCents !== undefined ? dto.adultPriceCents : schedule.adultPriceCents

    if (!nextPriceOnInquiry && nextAdultPriceCents == null) {
      throw new BadRequestException('班期须有成人价，或标记为询价')
    }

    await this.prisma.productSchedule.update({
      where: { id: schedule.id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.dateRuleText !== undefined ? { dateRuleText: dto.dateRuleText.trim() } : {}),
        ...(dto.startDate !== undefined ? { startDate: parseOptionalDate(dto.startDate) } : {}),
        ...(dto.endDate !== undefined ? { endDate: parseOptionalDate(dto.endDate) } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.priceOnInquiry !== undefined ? { priceOnInquiry: dto.priceOnInquiry } : {}),
        ...(dto.adultPriceCents !== undefined ? { adultPriceCents: dto.adultPriceCents } : {}),
        ...(dto.childPriceCents !== undefined ? { childPriceCents: dto.childPriceCents } : {}),
        ...(dto.singleRoomSupplementCents !== undefined
          ? { singleRoomSupplementCents: dto.singleRoomSupplementCents }
          : {}),
        ...(dto.notes !== undefined ? { notes: normalizeNullableText(dto.notes) } : {}),
      },
    })

    return this.getById(organizationId, productId)
  }

  async delete(organizationId: string, productId: string): Promise<void> {
    const product = await this.findProductOrThrow(organizationId, productId)
    if (product.schedules.length > 0) {
      throw new BadRequestException('已有班期的产品不可物理删除，只能下架')
    }

    await this.prisma.product.delete({ where: { id: productId } })
  }

  private assertStatusTransition(
    product: ProductWithRelations,
    nextStatus: ProductStatus,
  ): void {
    if (nextStatus === ProductStatus.on_sale) {
      const name = product.name.trim()
      const shortItinerary = product.shortItinerary.trim()
      if (!name || !shortItinerary) {
        throw new BadRequestException('上架须具备名称与简版行程')
      }

      const displayable = product.schedules.some(isDisplayableSchedule)
      if (!displayable) {
        throw new BadRequestException('上架须至少一条可展示班期（有成人价或明确询价）')
      }
    }
  }

  private async findProductOrThrow(
    organizationId: string,
    productId: string,
  ): Promise<ProductWithRelations> {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, organizationId },
      include: {
        specs: { orderBy: { createdAt: 'asc' } },
        schedules: { orderBy: { createdAt: 'asc' } },
      },
    })
    if (!product) {
      throw new NotFoundException('产品不存在')
    }
    return product
  }

  private async findScheduleOrThrow(
    organizationId: string,
    productId: string,
    scheduleId: string,
  ): Promise<ProductSchedule> {
    const schedule = await this.prisma.productSchedule.findFirst({
      where: {
        id: scheduleId,
        productId,
        product: { organizationId },
      },
    })
    if (!schedule) {
      throw new NotFoundException('班期不存在')
    }
    return schedule
  }

  private toListItem(
    product: Product & { schedules: Array<{ status: ProductScheduleStatus }> },
  ): ProductListItem {
    return {
      id: product.id,
      name: product.name,
      productType: product.productType,
      status: product.status,
      shortItinerary: product.shortItinerary,
      startCity: product.startCity,
      endCity: product.endCity,
      dayCount: product.dayCount,
      activeScheduleCount: countActiveSchedules(product.schedules),
      createdAt: product.createdAt.toISOString(),
      updatedAt: product.updatedAt.toISOString(),
    }
  }

  private toDetail(product: ProductWithRelations): ProductDetail {
    const spec = requirePrimarySpec(product)
    return {
      id: product.id,
      name: product.name,
      productType: product.productType,
      status: product.status,
      shortItinerary: product.shortItinerary,
      detailedItinerary: product.detailedItinerary,
      featuresText: product.featuresText,
      bookingNotice: product.bookingNotice,
      startCity: product.startCity,
      endCity: product.endCity,
      dayCount: product.dayCount,
      tags: product.tags,
      spec: this.toSpecSummary(spec),
      schedules: product.schedules.map((schedule) => this.toScheduleSummary(schedule)),
      activeScheduleCount: countActiveSchedules(product.schedules),
      createdAt: product.createdAt.toISOString(),
      updatedAt: product.updatedAt.toISOString(),
    }
  }

  private toSpecSummary(spec: ProductSpec): ProductSpecSummary {
    return {
      id: spec.id,
      name: spec.name,
      adultPriceCents: spec.adultPriceCents,
      childPriceCents: spec.childPriceCents,
      singleRoomSupplementCents: spec.singleRoomSupplementCents,
      notes: spec.notes,
      updatedAt: spec.updatedAt.toISOString(),
    }
  }

  private toScheduleSummary(schedule: ProductSchedule): ProductScheduleSummary {
    return {
      id: schedule.id,
      productId: schedule.productId,
      productSpecId: schedule.productSpecId,
      title: schedule.title,
      dateRuleText: schedule.dateRuleText,
      startDate: schedule.startDate ? formatDateOnly(schedule.startDate) : null,
      endDate: schedule.endDate ? formatDateOnly(schedule.endDate) : null,
      status: schedule.status,
      priceOnInquiry: schedule.priceOnInquiry,
      adultPriceCents: schedule.adultPriceCents,
      childPriceCents: schedule.childPriceCents,
      singleRoomSupplementCents: schedule.singleRoomSupplementCents,
      notes: schedule.notes,
      createdAt: schedule.createdAt.toISOString(),
      updatedAt: schedule.updatedAt.toISOString(),
    }
  }
}

function requirePrimarySpec(product: ProductWithRelations): ProductSpec {
  const spec = product.specs[0]
  if (!spec) {
    throw new BadRequestException('产品缺少价格规格')
  }
  return spec
}

function countActiveSchedules(
  schedules: Array<{ status: ProductScheduleStatus }>,
): number {
  return schedules.filter((schedule) => schedule.status !== ProductScheduleStatus.cancelled)
    .length
}

function isDisplayableSchedule(schedule: ProductSchedule): boolean {
  if (schedule.status === ProductScheduleStatus.cancelled) {
    return false
  }
  return schedule.priceOnInquiry || schedule.adultPriceCents != null
}

function normalizeNullableText(value: string | null | undefined): string | null {
  if (value == null) {
    return null
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function parseOptionalDate(value: string | null | undefined): Date | null {
  if (value == null || value === '') {
    return null
  }
  return parseDateOnly(value)
}
