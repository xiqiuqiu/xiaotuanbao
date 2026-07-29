import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import {
  companyIncomeCents,
  deriveDepartureIncomeSettlementComposite,
  DepartureIncomeCollectionStatus,
  DepartureIncomeCommissionStatus,
  DepartureIncomeType,
  statusesForDepartureIncomeSettlementComposite,
  type DepartureIncomeRecordListResult,
  type DepartureIncomeRecordSummary,
} from '@xiaotuanbao/shared'
import {
  DepartureStatus,
  Prisma,
  ResourceKind,
  type Departure,
  type DepartureIncomeRecord,
  type Supplier,
} from '@prisma/client'
import { PrismaService } from '../../database/prisma/prisma.service'
import { DepartureFinanceFacade } from '../finance/departure-finance-facade.service'
import type {
  CreateDepartureIncomeRecordDto,
  ListDepartureIncomeRecordsQueryDto,
  UpdateDepartureIncomeRecordDto,
} from './dto/departure-income-record.dto'
import {
  formatDateOnly,
  getShanghaiTodayString,
  parseDateOnly,
} from './departure-date.utils'

type IncomeRecordWithRelations = DepartureIncomeRecord & {
  departure: Departure
  partnerSupplier: Pick<Supplier, 'id' | 'name'> | null
  guideSupplier: Pick<Supplier, 'id' | 'name'> | null
}

@Injectable()
export class DepartureIncomeRecordService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly departureFinanceFacade: DepartureFinanceFacade,
  ) {}

  async list(
    organizationId: string,
    departureId: string,
    query: ListDepartureIncomeRecordsQueryDto = {},
  ): Promise<DepartureIncomeRecordListResult> {
    const departure = await this.findDepartureOrThrow(organizationId, departureId)
    const items = await this.prisma.departureIncomeRecord.findMany({
      where: this.buildListWhere(departure.id, query),
      include: {
        partnerSupplier: { select: { id: true, name: true } },
        guideSupplier: { select: { id: true, name: true } },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    })

    const summaries = items.map((item) => this.toSummary(item))
    const amountCentsTotal = summaries.reduce((sum, item) => sum + item.amountCents, 0)
    const commissionCentsTotal = summaries.reduce(
      (sum, item) => sum + item.commissionCents,
      0,
    )
    return {
      items: summaries,
      amountCentsTotal,
      commissionCentsTotal,
      companyIncomeCentsTotal: amountCentsTotal - commissionCentsTotal,
    }
  }

  async create(
    organizationId: string,
    departureId: string,
    dto: CreateDepartureIncomeRecordDto,
  ): Promise<DepartureIncomeRecordSummary> {
    const departure = await this.findDepartureOrThrow(organizationId, departureId)
    this.ensureMutable(departure, '新增增收记录')

    const projectName = this.normalizeProjectName(dto.projectName)
    const amountCents = dto.amountCents
    const commissionCents = dto.commissionCents ?? 0
    this.assertCommissionNotExceedAmount(amountCents, commissionCents)

    const partnerSupplierId = await this.resolveOptionalSupplierId(
      organizationId,
      dto.partnerSupplierId,
      '合作方',
    )
    const guideSupplierId =
      dto.guideSupplierId === undefined
        ? departure.guideSupplierId
        : await this.resolveGuideSupplierId(organizationId, dto.guideSupplierId)

    const created = await this.prisma.departureIncomeRecord.create({
      data: {
        departureId: departure.id,
        type: dto.type,
        projectName,
        partnerSupplierId,
        occurredOn: parseDateOnly(dto.occurredOn ?? getShanghaiTodayString()),
        amountCents,
        guideSupplierId,
        commissionCents,
        incomeStatus:
          dto.incomeStatus ?? DepartureIncomeCollectionStatus.UNCOLLECTED,
        commissionStatus:
          dto.commissionStatus ?? DepartureIncomeCommissionStatus.UNPAID,
        remark: this.normalizeRemark(dto.remark),
      },
      include: {
        partnerSupplier: { select: { id: true, name: true } },
        guideSupplier: { select: { id: true, name: true } },
      },
    })
    return this.toSummary(created)
  }

  async update(
    organizationId: string,
    departureId: string,
    incomeRecordId: string,
    dto: UpdateDepartureIncomeRecordDto,
  ): Promise<DepartureIncomeRecordSummary> {
    const item = await this.findIncomeRecordOrThrow(
      organizationId,
      departureId,
      incomeRecordId,
    )
    this.ensureMutable(item.departure, '编辑增收记录')

    const hasField =
      dto.type !== undefined ||
      dto.projectName !== undefined ||
      dto.partnerSupplierId !== undefined ||
      dto.occurredOn !== undefined ||
      dto.amountCents !== undefined ||
      dto.guideSupplierId !== undefined ||
      dto.commissionCents !== undefined ||
      dto.incomeStatus !== undefined ||
      dto.commissionStatus !== undefined ||
      dto.remark !== undefined
    if (!hasField) {
      throw new BadRequestException('请至少提供一个待更新字段')
    }

    const amountCents = dto.amountCents ?? item.amountCents
    const commissionCents = dto.commissionCents ?? item.commissionCents
    this.assertCommissionNotExceedAmount(amountCents, commissionCents)

    const partnerSupplierId =
      dto.partnerSupplierId === undefined
        ? undefined
        : await this.resolveOptionalSupplierId(
            organizationId,
            dto.partnerSupplierId,
            '合作方',
          )
    const guideSupplierId =
      dto.guideSupplierId === undefined
        ? undefined
        : await this.resolveGuideSupplierId(organizationId, dto.guideSupplierId)

    const updated = await this.prisma.departureIncomeRecord.update({
      where: { id: item.id },
      data: {
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.projectName !== undefined
          ? { projectName: this.normalizeProjectName(dto.projectName) }
          : {}),
        ...(partnerSupplierId !== undefined ? { partnerSupplierId } : {}),
        ...(dto.occurredOn !== undefined
          ? { occurredOn: parseDateOnly(dto.occurredOn) }
          : {}),
        ...(dto.amountCents !== undefined ? { amountCents: dto.amountCents } : {}),
        ...(guideSupplierId !== undefined ? { guideSupplierId } : {}),
        ...(dto.commissionCents !== undefined
          ? { commissionCents: dto.commissionCents }
          : {}),
        ...(dto.incomeStatus !== undefined ? { incomeStatus: dto.incomeStatus } : {}),
        ...(dto.commissionStatus !== undefined
          ? { commissionStatus: dto.commissionStatus }
          : {}),
        ...(dto.remark !== undefined ? { remark: this.normalizeRemark(dto.remark) } : {}),
      },
      include: {
        partnerSupplier: { select: { id: true, name: true } },
        guideSupplier: { select: { id: true, name: true } },
      },
    })
    return this.toSummary(updated)
  }

  async delete(
    organizationId: string,
    departureId: string,
    incomeRecordId: string,
  ): Promise<void> {
    const item = await this.findIncomeRecordOrThrow(
      organizationId,
      departureId,
      incomeRecordId,
    )
    this.ensureMutable(item.departure, '删除增收记录')
    await this.prisma.departureIncomeRecord.delete({ where: { id: item.id } })
  }

  private buildListWhere(
    departureId: string,
    query: ListDepartureIncomeRecordsQueryDto,
  ): Prisma.DepartureIncomeRecordWhereInput {
    const where: Prisma.DepartureIncomeRecordWhereInput = { departureId }

    if (query.type) {
      where.type = query.type
    }

    if (query.settlementComposite) {
      const statusPair = statusesForDepartureIncomeSettlementComposite(
        query.settlementComposite,
      )
      where.incomeStatus = statusPair.incomeStatus
      where.commissionStatus = statusPair.commissionStatus
    }

    const keyword = query.keyword?.trim()
    if (keyword) {
      where.OR = [
        { projectName: { contains: keyword, mode: 'insensitive' } },
        { remark: { contains: keyword, mode: 'insensitive' } },
        { partnerSupplier: { name: { contains: keyword, mode: 'insensitive' } } },
      ]
    }

    return where
  }

  private async findDepartureOrThrow(
    organizationId: string,
    departureId: string,
  ): Promise<Departure> {
    const departure = await this.prisma.departure.findFirst({
      where: { id: departureId, organizationId },
    })
    if (!departure) {
      throw new NotFoundException('发团不存在')
    }
    return departure
  }

  private async findIncomeRecordOrThrow(
    organizationId: string,
    departureId: string,
    incomeRecordId: string,
  ): Promise<IncomeRecordWithRelations> {
    const item = await this.prisma.departureIncomeRecord.findFirst({
      where: {
        id: incomeRecordId,
        departureId,
        departure: { organizationId },
      },
      include: {
        departure: true,
        partnerSupplier: { select: { id: true, name: true } },
        guideSupplier: { select: { id: true, name: true } },
      },
    })
    if (!item) {
      throw new NotFoundException('增收记录不存在')
    }
    return item
  }

  private normalizeProjectName(value: string): string {
    const projectName = value.trim()
    if (!projectName) {
      throw new BadRequestException('项目名称不能为空')
    }
    if (projectName.length > 50) {
      throw new BadRequestException('项目名称不能超过50字')
    }
    return projectName
  }

  private normalizeRemark(value: string | null | undefined): string | null {
    if (value == null) {
      return null
    }
    const remark = value.trim()
    if (!remark) {
      return null
    }
    if (remark.length > 200) {
      throw new BadRequestException('备注不能超过200字')
    }
    return remark
  }

  private assertCommissionNotExceedAmount(
    amountCents: number,
    commissionCents: number,
  ): void {
    if (commissionCents > amountCents) {
      throw new BadRequestException('导游提成不得大于增收金额')
    }
  }

  private async resolveOptionalSupplierId(
    organizationId: string,
    supplierId: string | null | undefined,
    label: string,
  ): Promise<string | null> {
    if (supplierId == null) {
      return null
    }
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: supplierId, organizationId },
      select: { id: true },
    })
    if (!supplier) {
      throw new BadRequestException(`${label}不存在`)
    }
    return supplier.id
  }

  private async resolveGuideSupplierId(
    organizationId: string,
    guideSupplierId: string | null,
  ): Promise<string | null> {
    if (guideSupplierId == null) {
      return null
    }
    const supplier = await this.prisma.supplier.findFirst({
      where: {
        id: guideSupplierId,
        organizationId,
        categories: { has: ResourceKind.guide },
      },
      select: { id: true },
    })
    if (!supplier) {
      throw new BadRequestException('导游须为导游类供应商')
    }
    return supplier.id
  }

  private ensureMutable(departure: Departure, action: string): void {
    this.departureFinanceFacade.assertMutable(departure, action)
    if (departure.status === DepartureStatus.settled) {
      throw new ConflictException(`发团已结清，不可${action}`)
    }
  }

  private toSummary(
    item: Pick<
      DepartureIncomeRecord,
      | 'id'
      | 'departureId'
      | 'type'
      | 'projectName'
      | 'partnerSupplierId'
      | 'occurredOn'
      | 'amountCents'
      | 'guideSupplierId'
      | 'commissionCents'
      | 'incomeStatus'
      | 'commissionStatus'
      | 'remark'
      | 'createdAt'
      | 'updatedAt'
    > & {
      partnerSupplier?: Pick<Supplier, 'id' | 'name'> | null
      guideSupplier?: Pick<Supplier, 'id' | 'name'> | null
    },
  ): DepartureIncomeRecordSummary {
    const incomeStatus = item.incomeStatus as DepartureIncomeCollectionStatus
    const commissionStatus = item.commissionStatus as DepartureIncomeCommissionStatus
    return {
      id: item.id,
      departureId: item.departureId,
      type: item.type as DepartureIncomeType,
      projectName: item.projectName,
      partnerSupplierId: item.partnerSupplierId,
      partnerSupplierName: item.partnerSupplier?.name ?? null,
      occurredOn: formatDateOnly(item.occurredOn),
      amountCents: item.amountCents,
      guideSupplierId: item.guideSupplierId,
      guideSupplierName: item.guideSupplier?.name ?? null,
      commissionCents: item.commissionCents,
      companyIncomeCents: companyIncomeCents({
        amountCents: item.amountCents,
        commissionCents: item.commissionCents,
      }),
      incomeStatus,
      commissionStatus,
      settlementComposite: deriveDepartureIncomeSettlementComposite({
        incomeStatus,
        commissionStatus,
      }),
      remark: item.remark,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    }
  }
}
