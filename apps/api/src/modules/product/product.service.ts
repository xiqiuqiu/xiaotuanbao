import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import type {
  ProductDetail,
  ProductListResult,
  ProductScheduleSummary,
  ProductSpecSummary,
  ProductSummary,
} from '@xiaotuanbao/shared'
import {
  canPublishProduct,
  isEffectiveProductSchedule,
  snapshotSchedulePricesFromSpec,
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

  async list(organizationId: string, query: ListProductsQueryDto): Promise<ProductListResult> {
    const page = Math.max(Number(query.page) || 1, 1)
    const pageSize = Math.min(Math.max(Number(query.pageSize) || 10, 1), 100)
    const search = query.search?.trim()
    const includeOffShelf = query.includeOffShelf === true

    const where = {
      organizationId,
      ...(!includeOffShelf && !query.status
        ? { status: { not: ProductStatus.off_shelf } }
        : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              { shortItinerary: { contains: search, mode: 'insensitive' as const } },
              { departureCity: { contains: search, mode: 'insensitive' as const } },
              { arrivalCity: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    }

    const [items, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: { schedules: { select: { status: true } } },
        orderBy: [{ updatedAt: 'desc' }, { name: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.product.count({ where }),
    ])

    return {
      items: items.map((product) =>
        this.toProductSummary(product, product.schedules),
      ),
      total,
      page,
      pageSize,
    }
  }

  async getById(organizationId: string, productId: string): Promise<ProductDetail> {
    const product = await this.findProductDetailOrThrow(organizationId, productId)
    return this.toProductDetail(product)
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
        productType: ProductType.group_tour,
        status: ProductStatus.draft,
        tags: this.normalizeTags(dto.tags),
        departureCity: dto.departureCity?.trim() || null,
        arrivalCity: dto.arrivalCity?.trim() || null,
        dayCount: dto.dayCount ?? null,
        shortItinerary: dto.shortItinerary?.trim() || null,
        specs: {
          create: { name: '标准' },
        },
      },
      include: {
        specs: true,
        schedules: { orderBy: [{ createdAt: 'asc' }] },
      },
    })

    return this.toProductDetail(product)
  }

  async update(
    organizationId: string,
    productId: string,
    dto: UpdateProductDto,
  ): Promise<ProductDetail> {
    const product = await this.findProductDetailOrThrow(organizationId, productId)
    if (product.status === ProductStatus.off_shelf) {
      throw new BadRequestException('已下架产品不可编辑，请先恢复上架或保持只读')
    }

    const name = dto.name.trim()
    if (!name) {
      throw new BadRequestException('产品名称不能为空')
    }

    const updated = await this.prisma.product.update({
      where: { id: product.id },
      data: {
        name,
        tags: this.normalizeTags(dto.tags),
        departureCity:
          dto.departureCity === undefined
            ? undefined
            : dto.departureCity?.trim() || null,
        arrivalCity:
          dto.arrivalCity === undefined ? undefined : dto.arrivalCity?.trim() || null,
        dayCount: dto.dayCount === undefined ? undefined : dto.dayCount,
        shortItinerary:
          dto.shortItinerary === undefined
            ? undefined
            : dto.shortItinerary?.trim() || null,
      },
      include: {
        specs: true,
        schedules: { orderBy: [{ createdAt: 'asc' }] },
      },
    })

    return this.toProductDetail(updated)
  }

  async updateSpec(
    organizationId: string,
    productId: string,
    dto: UpdateProductSpecDto,
  ): Promise<ProductDetail> {
    const product = await this.findProductDetailOrThrow(organizationId, productId)
    this.assertEditable(product)

    const spec = product.specs[0]
    if (!spec) {
      throw new BadRequestException('产品缺少价格规格')
    }

    await this.prisma.productSpec.update({
      where: { id: spec.id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() || '标准' } : {}),
        ...(dto.adultPriceCents !== undefined
          ? { adultPriceCents: dto.adultPriceCents }
          : {}),
        ...(dto.childPriceCents !== undefined
          ? { childPriceCents: dto.childPriceCents }
          : {}),
        ...(dto.singleSupplementCents !== undefined
          ? { singleSupplementCents: dto.singleSupplementCents }
          : {}),
      },
    })

    // ADR-0025：改规格默认价不回写既有班期——此处故意不 touch schedules。
    return this.getById(organizationId, productId)
  }

  async createSchedule(
    organizationId: string,
    productId: string,
    dto: CreateProductScheduleDto,
  ): Promise<ProductDetail> {
    const product = await this.findProductDetailOrThrow(organizationId, productId)
    this.assertEditable(product)

    const spec = product.specs[0]
    if (!spec) {
      throw new BadRequestException('产品缺少价格规格，无法创建班期')
    }

    const snapshot = snapshotSchedulePricesFromSpec({
      adultPriceCents: spec.adultPriceCents,
      childPriceCents: spec.childPriceCents,
      singleSupplementCents: spec.singleSupplementCents,
    })

    await this.prisma.productSchedule.create({
      data: {
        productId: product.id,
        sourceSpecId: spec.id,
        description: dto.description?.trim() || '',
        dateRuleText: dto.dateRuleText?.trim() || null,
        dateRangeStart: this.parseOptionalDate(dto.dateRangeStart),
        dateRangeEnd: this.parseOptionalDate(dto.dateRangeEnd),
        adultPriceCents:
          dto.adultPriceCents !== undefined ? dto.adultPriceCents : snapshot.adultPriceCents,
        childPriceCents:
          dto.childPriceCents !== undefined ? dto.childPriceCents : snapshot.childPriceCents,
        singleSupplementCents:
          dto.singleSupplementCents !== undefined
            ? dto.singleSupplementCents
            : snapshot.singleSupplementCents,
        inquireOnly: dto.inquireOnly === true,
        notes: dto.notes?.trim() || null,
        status: dto.status ?? ProductScheduleStatus.on_sale,
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
    const product = await this.findProductDetailOrThrow(organizationId, productId)
    this.assertEditable(product)

    const schedule = product.schedules.find((row) => row.id === scheduleId)
    if (!schedule) {
      throw new NotFoundException('班期不存在')
    }

    await this.prisma.productSchedule.update({
      where: { id: schedule.id },
      data: {
        ...(dto.description !== undefined
          ? { description: dto.description.trim() }
          : {}),
        ...(dto.dateRuleText !== undefined
          ? { dateRuleText: dto.dateRuleText?.trim() || null }
          : {}),
        ...(dto.dateRangeStart !== undefined
          ? { dateRangeStart: this.parseOptionalDate(dto.dateRangeStart) }
          : {}),
        ...(dto.dateRangeEnd !== undefined
          ? { dateRangeEnd: this.parseOptionalDate(dto.dateRangeEnd) }
          : {}),
        ...(dto.adultPriceCents !== undefined
          ? { adultPriceCents: dto.adultPriceCents }
          : {}),
        ...(dto.childPriceCents !== undefined
          ? { childPriceCents: dto.childPriceCents }
          : {}),
        ...(dto.singleSupplementCents !== undefined
          ? { singleSupplementCents: dto.singleSupplementCents }
          : {}),
        ...(dto.inquireOnly !== undefined ? { inquireOnly: dto.inquireOnly } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes?.trim() || null } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
    })

    return this.getById(organizationId, productId)
  }

  async publish(organizationId: string, productId: string): Promise<ProductDetail> {
    const product = await this.findProductDetailOrThrow(organizationId, productId)
    if (product.status === ProductStatus.on_sale) {
      return this.toProductDetail(product)
    }

    if (
      !canPublishProduct({
        name: product.name,
        shortItinerary: product.shortItinerary,
        schedules: product.schedules.map((s) => ({
          status: s.status,
          adultPriceCents: s.adultPriceCents,
          inquireOnly: s.inquireOnly,
        })),
      })
    ) {
      throw new BadRequestException(
        '上架须满足：名称、简版行程，以及至少一条可展示班期（有成人价或明确询价）',
      )
    }

    await this.prisma.product.update({
      where: { id: product.id },
      data: { status: ProductStatus.on_sale },
    })

    return this.getById(organizationId, productId)
  }

  async offShelf(organizationId: string, productId: string): Promise<ProductDetail> {
    const product = await this.findProductDetailOrThrow(organizationId, productId)
    if (product.status === ProductStatus.off_shelf) {
      return this.toProductDetail(product)
    }

    await this.prisma.product.update({
      where: { id: product.id },
      data: { status: ProductStatus.off_shelf },
    })

    return this.getById(organizationId, productId)
  }

  async restoreDraft(organizationId: string, productId: string): Promise<ProductDetail> {
    const product = await this.findProductDetailOrThrow(organizationId, productId)
    if (product.status !== ProductStatus.off_shelf) {
      throw new BadRequestException('仅已下架产品可恢复为草稿')
    }

    await this.prisma.product.update({
      where: { id: product.id },
      data: { status: ProductStatus.draft },
    })

    return this.getById(organizationId, productId)
  }

  /**
   * 已有班期的产品不可物理删除，只能下架。
   * 无班期时可硬删（级联删规格）。
   */
  async remove(organizationId: string, productId: string): Promise<void> {
    const product = await this.findProductDetailOrThrow(organizationId, productId)
    if (product.schedules.length > 0) {
      throw new BadRequestException('已有班期的产品不可删除，请下架保留历史')
    }

    await this.prisma.product.delete({ where: { id: product.id } })
  }

  private assertEditable(product: Product) {
    if (product.status === ProductStatus.off_shelf) {
      throw new BadRequestException('已下架产品不可编辑')
    }
  }

  private normalizeTags(tags: string[] | undefined): string[] {
    if (!tags) {
      return []
    }
    return [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))]
  }

  private parseOptionalDate(value: string | null | undefined): Date | null {
    if (value === undefined || value === null || value === '') {
      return null
    }
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('日期格式无效')
    }
    return date
  }

  private async findProductDetailOrThrow(
    organizationId: string,
    productId: string,
  ): Promise<ProductWithRelations> {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, organizationId },
      include: {
        specs: { orderBy: [{ createdAt: 'asc' }] },
        schedules: { orderBy: [{ createdAt: 'asc' }] },
      },
    })

    if (!product) {
      throw new NotFoundException('产品不存在')
    }

    return product
  }

  private toProductSummary(
    product: Product,
    schedules: Array<{ status: ProductScheduleStatus }>,
  ): ProductSummary {
    return {
      id: product.id,
      name: product.name,
      productType: product.productType,
      status: product.status,
      tags: product.tags,
      departureCity: product.departureCity,
      arrivalCity: product.arrivalCity,
      dayCount: product.dayCount,
      shortItinerary: product.shortItinerary,
      effectiveScheduleCount: schedules.filter(isEffectiveProductSchedule).length,
      createdAt: product.createdAt.toISOString(),
      updatedAt: product.updatedAt.toISOString(),
    }
  }

  private toProductDetail(product: ProductWithRelations): ProductDetail {
    const summary = this.toProductSummary(product, product.schedules)
    return {
      ...summary,
      spec: product.specs[0] ? this.toSpecSummary(product.specs[0]) : null,
      schedules: product.schedules.map((schedule) => this.toScheduleSummary(schedule)),
    }
  }

  private toSpecSummary(spec: ProductSpec): ProductSpecSummary {
    return {
      id: spec.id,
      name: spec.name,
      adultPriceCents: spec.adultPriceCents,
      childPriceCents: spec.childPriceCents,
      singleSupplementCents: spec.singleSupplementCents,
      createdAt: spec.createdAt.toISOString(),
      updatedAt: spec.updatedAt.toISOString(),
    }
  }

  private toScheduleSummary(schedule: ProductSchedule): ProductScheduleSummary {
    return {
      id: schedule.id,
      productId: schedule.productId,
      sourceSpecId: schedule.sourceSpecId,
      description: schedule.description,
      dateRuleText: schedule.dateRuleText,
      dateRangeStart: schedule.dateRangeStart
        ? schedule.dateRangeStart.toISOString().slice(0, 10)
        : null,
      dateRangeEnd: schedule.dateRangeEnd
        ? schedule.dateRangeEnd.toISOString().slice(0, 10)
        : null,
      adultPriceCents: schedule.adultPriceCents,
      childPriceCents: schedule.childPriceCents,
      singleSupplementCents: schedule.singleSupplementCents,
      inquireOnly: schedule.inquireOnly,
      notes: schedule.notes,
      status: schedule.status,
      createdAt: schedule.createdAt.toISOString(),
      updatedAt: schedule.updatedAt.toISOString(),
    }
  }
}
