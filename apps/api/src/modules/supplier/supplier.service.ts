import { ConflictException, Injectable } from '@nestjs/common'
import type { SupplierListResult, SupplierSummary } from '@xiaotuanbao/shared'
import {
  DirectoryProfileStatus,
  InvoiceAvailable,
  type Supplier,
} from '@prisma/client'
import { PrismaService } from '../../database/prisma/prisma.service'
import type { CreateSupplierDto, ListSuppliersQueryDto } from './dto/supplier.dto'

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
      ...(query.category ? { category: query.category } : {}),
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

  async create(organizationId: string, dto: CreateSupplierDto): Promise<SupplierSummary> {
    const name = dto.name.trim()
    const existing = await this.prisma.supplier.findFirst({
      where: { organizationId, name },
    })

    if (existing) {
      throw new ConflictException('供应商名称已存在')
    }

    const invoiceAvailable = dto.invoiceAvailable ?? null
    const invoiceFields =
      invoiceAvailable === InvoiceAvailable.no
        ? { invoiceType: null, taxRate: null }
        : {
            invoiceType: dto.invoiceType ?? null,
            taxRate: dto.taxRate?.trim() || null,
          }

    const supplier = await this.prisma.supplier.create({
      data: {
        organizationId,
        name,
        category: dto.category,
        status: DirectoryProfileStatus.active,
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
      },
    })

    return this.toSupplierSummary(supplier)
  }

  private toSupplierSummary(supplier: Supplier): SupplierSummary {
    return {
      id: supplier.id,
      name: supplier.name,
      category: supplier.category,
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
