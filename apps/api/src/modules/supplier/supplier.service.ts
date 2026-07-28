import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import type { SupplierListResult, SupplierSummary } from '@xiaotuanbao/shared'
import {
  normalizeSupplierCategories,
  InvalidSupplierCategoriesError,
  RESOURCE_KIND_LABELS,
  ResourceKind,
} from '@xiaotuanbao/shared'
import {
  DirectoryProfileStatus,
  InvoiceAvailable,
  type Supplier,
} from '@prisma/client'
import { PrismaService } from '../../database/prisma/prisma.service'
import type {
  CreateSupplierDto,
  ListSuppliersQueryDto,
  UpdateSupplierDto,
} from './dto/supplier.dto'

type SupplierFieldDto = CreateSupplierDto | UpdateSupplierDto

@Injectable()
export class SupplierService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    organizationId: string,
    query: ListSuppliersQueryDto,
  ): Promise<SupplierListResult> {
    const page = Math.max(Number(query.page) || 1, 1)
    const pageSize = Math.min(Math.max(Number(query.pageSize) || 10, 1), 100)
    const search = query.search?.trim()
    const includeArchived = query.includeArchived === true
    const statusFilter =
      query.status && (!includeArchived && query.status === DirectoryProfileStatus.archived
        ? undefined
        : query.status)

    const where = {
      organizationId,
      ...(!includeArchived ? { status: { not: DirectoryProfileStatus.archived } } : {}),
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(query.category ? { categories: { has: query.category } } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              { contactName: { contains: search, mode: 'insensitive' as const } },
              { contactPhone: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    }

    const [items, total] = await Promise.all([
      this.prisma.supplier.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { name: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.supplier.count({ where }),
    ])

    return {
      items: items.map((supplier) => this.toSupplierSummary(supplier)),
      total,
      page,
      pageSize,
    }
  }

  async getById(organizationId: string, supplierId: string): Promise<SupplierSummary> {
    const supplier = await this.findSupplierOrThrow(organizationId, supplierId)
    return this.toSupplierSummary(supplier)
  }

  async create(organizationId: string, dto: CreateSupplierDto): Promise<SupplierSummary> {
    const name = dto.name.trim()
    await this.ensureNameAvailable(organizationId, name)
    const categories = this.requireCategories(dto.categories)

    const supplier = await this.prisma.supplier.create({
      data: {
        organizationId,
        name,
        categories,
        status: DirectoryProfileStatus.active,
        ...this.toSupplierFieldData(dto),
      },
    })

    return this.toSupplierSummary(supplier)
  }

  async update(
    organizationId: string,
    supplierId: string,
    dto: UpdateSupplierDto,
  ): Promise<SupplierSummary> {
    const supplier = await this.findSupplierOrThrow(organizationId, supplierId)

    if (supplier.status === DirectoryProfileStatus.archived) {
      throw new BadRequestException('已归档供应商不可编辑，请先恢复')
    }

    const name = dto.name.trim()
    await this.ensureNameAvailable(organizationId, name, supplier.id)
    const categories = this.requireCategories(dto.categories)
    await this.ensureRemovedCategoriesNotInUse(supplier.id, supplier.categories, categories)

    const updated = await this.prisma.supplier.update({
      where: { id: supplier.id },
      data: {
        name,
        categories,
        status: dto.status,
        ...this.toSupplierFieldData(dto),
      },
    })

    return this.toSupplierSummary(updated)
  }

  async archive(organizationId: string, supplierId: string): Promise<SupplierSummary> {
    const supplier = await this.findSupplierOrThrow(organizationId, supplierId)

    if (supplier.status === DirectoryProfileStatus.archived) {
      throw new BadRequestException('供应商已归档')
    }

    const updated = await this.prisma.supplier.update({
      where: { id: supplier.id },
      data: { status: DirectoryProfileStatus.archived },
    })

    return this.toSupplierSummary(updated)
  }

  async restore(organizationId: string, supplierId: string): Promise<SupplierSummary> {
    const supplier = await this.findSupplierOrThrow(organizationId, supplierId)

    if (supplier.status !== DirectoryProfileStatus.archived) {
      throw new BadRequestException('仅已归档供应商可恢复')
    }

    const updated = await this.prisma.supplier.update({
      where: { id: supplier.id },
      data: { status: DirectoryProfileStatus.active },
    })

    return this.toSupplierSummary(updated)
  }

  private requireCategories(categories: string[]) {
    try {
      return normalizeSupplierCategories(categories)
    } catch (error) {
      if (error instanceof InvalidSupplierCategoriesError) {
        throw new BadRequestException(error.message)
      }
      throw error
    }
  }

  private async ensureRemovedCategoriesNotInUse(
    supplierId: string,
    previousCategories: readonly string[],
    nextCategories: readonly string[],
  ) {
    const nextSet = new Set(nextCategories)
    const removed = previousCategories.filter((kind) => !nextSet.has(kind))
    if (removed.length === 0) {
      return
    }

    const [inUse, driverUseCount, guideUseCount] = await Promise.all([
      this.prisma.segmentResource.findMany({
        where: {
          supplierId,
          resourceKind: { in: removed as ResourceKind[] },
        },
        select: { resourceKind: true },
        distinct: ['resourceKind'],
      }),
      removed.includes(ResourceKind.TRANSPORT)
        ? this.prisma.departure.count({ where: { driverSupplierId: supplierId } })
        : Promise.resolve(0),
      removed.includes(ResourceKind.GUIDE)
        ? this.prisma.departure.count({ where: { guideSupplierId: supplierId } })
        : Promise.resolve(0),
    ])

    if (inUse.length === 0 && driverUseCount === 0 && guideUseCount === 0) {
      return
    }

    const usedKinds = new Set(inUse.map((row) => row.resourceKind as ResourceKind))
    if (driverUseCount > 0) {
      usedKinds.add(ResourceKind.TRANSPORT)
    }
    if (guideUseCount > 0) {
      usedKinds.add(ResourceKind.GUIDE)
    }
    const labels = [...usedKinds].map((kind) => RESOURCE_KIND_LABELS[kind] ?? kind)
    const usage =
      driverUseCount > 0 || guideUseCount > 0
        ? inUse.length > 0
          ? '行程段资源或发团执行班组'
          : '发团执行班组'
        : '行程段资源'
    throw new BadRequestException(
      `供应商类别「${labels.join('、')}」仍被关联${usage}使用，无法移除`,
    )
  }

  private async findSupplierOrThrow(organizationId: string, supplierId: string) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: supplierId, organizationId },
    })

    if (!supplier) {
      throw new NotFoundException('供应商不存在')
    }

    return supplier
  }

  private async ensureNameAvailable(
    organizationId: string,
    name: string,
    excludeSupplierId?: string,
  ) {
    const existing = await this.prisma.supplier.findFirst({
      where: {
        organizationId,
        name,
        ...(excludeSupplierId ? { id: { not: excludeSupplierId } } : {}),
      },
    })

    if (existing) {
      throw new ConflictException('供应商名称已存在')
    }
  }

  private toSupplierFieldData(dto: SupplierFieldDto) {
    const invoiceAvailable = dto.invoiceAvailable ?? null
    const invoiceFields =
      invoiceAvailable === InvoiceAvailable.no
        ? { invoiceType: null, taxRate: null }
        : {
            invoiceType: dto.invoiceType ?? null,
            taxRate: dto.taxRate?.trim() || null,
          }

    return {
      contactName: dto.contactName?.trim() || null,
      contactPhone: dto.contactPhone?.trim() || null,
      settlementMethod: dto.settlementMethod ?? null,
      settlementCycle: dto.settlementCycle ?? null,
      settlementNotes: dto.settlementNotes?.trim() || null,
      referenceQuoteNotes: dto.referenceQuoteNotes?.trim() || null,
      invoiceAvailable,
      ...invoiceFields,
      accountName: dto.accountName?.trim() || null,
      bankName: dto.bankName?.trim() || null,
      bankAccount: dto.bankAccount?.trim() || null,
      businessNotes: dto.businessNotes?.trim() || null,
    }
  }

  private toSupplierSummary(supplier: Supplier): SupplierSummary {
    return {
      id: supplier.id,
      name: supplier.name,
      categories: supplier.categories,
      status: supplier.status,
      contactName: supplier.contactName,
      contactPhone: supplier.contactPhone,
      settlementMethod: supplier.settlementMethod,
      settlementCycle: supplier.settlementCycle,
      settlementNotes: supplier.settlementNotes,
      referenceQuoteNotes: supplier.referenceQuoteNotes,
      invoiceAvailable: supplier.invoiceAvailable,
      invoiceType: supplier.invoiceType,
      taxRate: supplier.taxRate,
      accountName: supplier.accountName,
      bankName: supplier.bankName,
      bankAccount: supplier.bankAccount,
      businessNotes: supplier.businessNotes,
      createdAt: supplier.createdAt.toISOString(),
      updatedAt: supplier.updatedAt.toISOString(),
    }
  }
}
