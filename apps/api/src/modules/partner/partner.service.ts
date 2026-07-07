import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import type { PartnerListResult, PartnerSummary } from '@xiaotuanbao/shared'
import { DirectoryProfileStatus, type Partner } from '@prisma/client'
import { PrismaService } from '../../database/prisma/prisma.service'
import type {
  CreatePartnerDto,
  ListPartnersQueryDto,
  UpdatePartnerDto,
} from './dto/partner.dto'

const UPDATE_PARTNER_FIELDS = [
  'name',
  'partnerKind',
  'partnerType',
  'contactName',
  'contactRole',
  'contactPhone',
  'settlementMethod',
  'paymentTermRule',
  'settlementNotes',
  'status',
] as const

@Injectable()
export class PartnerService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    organizationId: string,
    query: ListPartnersQueryDto,
  ): Promise<PartnerListResult> {
    const page = Math.max(Number(query.page) || 1, 1)
    const pageSize = Math.min(Math.max(Number(query.pageSize) || 10, 1), 100)
    const search = query.search?.trim()
    const includeArchived = query.includeArchived === true

    const where = {
      organizationId,
      ...(!includeArchived ? { status: { not: DirectoryProfileStatus.archived } } : {}),
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
      this.prisma.partner.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { name: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.partner.count({ where }),
    ])

    return {
      items: items.map((partner) => this.toPartnerSummary(partner)),
      total,
      page,
      pageSize,
    }
  }

  async getById(organizationId: string, partnerId: string): Promise<PartnerSummary> {
    const partner = await this.findPartnerOrThrow(organizationId, partnerId)
    return this.toPartnerSummary(partner)
  }

  async create(organizationId: string, dto: CreatePartnerDto): Promise<PartnerSummary> {
    const name = dto.name.trim()
    if (!name) {
      throw new BadRequestException('合作伙伴名称不能为空')
    }

    await this.ensureNameAvailable(organizationId, name)

    const partner = await this.prisma.partner.create({
      data: {
        organizationId,
        name,
        partnerKind: dto.partnerKind,
        partnerType: dto.partnerType,
        status: DirectoryProfileStatus.active,
        contactName: dto.contactName?.trim() || null,
        contactRole: dto.contactRole ?? null,
        contactPhone: dto.contactPhone?.trim() || null,
        settlementMethod: dto.settlementMethod ?? null,
        paymentTermRule: dto.paymentTermRule ?? null,
        settlementNotes: dto.settlementNotes?.trim() || null,
      },
    })

    return this.toPartnerSummary(partner)
  }

  async update(
    organizationId: string,
    partnerId: string,
    dto: UpdatePartnerDto,
  ): Promise<PartnerSummary> {
    const partner = await this.findPartnerOrThrow(organizationId, partnerId)

    if (partner.status === DirectoryProfileStatus.archived) {
      throw new BadRequestException('已归档合作伙伴不可编辑，请先恢复')
    }

    if (!this.hasUpdateFields(dto)) {
      throw new BadRequestException('请至少提供一个待更新字段')
    }

    const data: Record<string, unknown> = {}

    if (dto.name !== undefined) {
      const name = dto.name.trim()
      if (!name) {
        throw new BadRequestException('合作伙伴名称不能为空')
      }
      await this.ensureNameAvailable(organizationId, name, partner.id)
      data.name = name
    }

    if (dto.partnerKind !== undefined) {
      data.partnerKind = dto.partnerKind
    }

    if (dto.partnerType !== undefined) {
      data.partnerType = dto.partnerType
    }

    if (dto.status !== undefined) {
      data.status = dto.status
    }

    if (dto.contactName !== undefined) {
      data.contactName = dto.contactName.trim() || null
    }

    if (dto.contactRole !== undefined) {
      data.contactRole = dto.contactRole
    }

    if (dto.contactPhone !== undefined) {
      data.contactPhone = dto.contactPhone.trim() || null
    }

    if (dto.settlementMethod !== undefined) {
      data.settlementMethod = dto.settlementMethod
    }

    if (dto.paymentTermRule !== undefined) {
      data.paymentTermRule = dto.paymentTermRule
    }

    if (dto.settlementNotes !== undefined) {
      data.settlementNotes = dto.settlementNotes.trim() || null
    }

    const updated = await this.prisma.partner.update({
      where: { id: partner.id },
      data,
    })

    return this.toPartnerSummary(updated)
  }

  private hasUpdateFields(dto: UpdatePartnerDto): boolean {
    return UPDATE_PARTNER_FIELDS.some((field) => dto[field] !== undefined)
  }

  private async findPartnerOrThrow(organizationId: string, partnerId: string) {
    const partner = await this.prisma.partner.findFirst({
      where: { id: partnerId, organizationId },
    })

    if (!partner) {
      throw new NotFoundException('合作伙伴不存在')
    }

    return partner
  }

  private async ensureNameAvailable(
    organizationId: string,
    name: string,
    excludePartnerId?: string,
  ) {
    const existing = await this.prisma.partner.findFirst({
      where: {
        organizationId,
        name,
        ...(excludePartnerId ? { id: { not: excludePartnerId } } : {}),
      },
    })

    if (existing) {
      throw new ConflictException('合作伙伴名称已存在')
    }
  }

  private toPartnerSummary(partner: Partner): PartnerSummary {
    return {
      id: partner.id,
      name: partner.name,
      partnerKind: partner.partnerKind,
      partnerType: partner.partnerType,
      status: partner.status,
      contactName: partner.contactName,
      contactRole: partner.contactRole,
      contactPhone: partner.contactPhone,
      settlementMethod: partner.settlementMethod,
      paymentTermRule: partner.paymentTermRule,
      settlementNotes: partner.settlementNotes,
      createdAt: partner.createdAt.toISOString(),
      updatedAt: partner.updatedAt.toISOString(),
    }
  }
}
