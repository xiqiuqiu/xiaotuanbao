import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import type {
  GroundIncomeListResult,
  GroundIncomeSummary,
} from '@xiaotuanbao/shared'
import { DepartureStatus, type Departure, type GroundIncome } from '@prisma/client'
import { PrismaService } from '../../database/prisma/prisma.service'
import { DepartureFinanceFacade } from '../finance/departure-finance-facade.service'
import type {
  CreateGroundIncomeDto,
  UpdateGroundIncomeDto,
} from './dto/ground-income.dto'

type GroundIncomeWithDeparture = GroundIncome & { departure: Departure }

@Injectable()
export class GroundIncomeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly departureFinanceFacade: DepartureFinanceFacade,
  ) {}

  async list(
    organizationId: string,
    departureId: string,
  ): Promise<GroundIncomeListResult> {
    const departure = await this.findDepartureOrThrow(organizationId, departureId)
    const items = await this.prisma.groundIncome.findMany({
      where: { departureId: departure.id },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    })

    return {
      items: items.map((item) => this.toSummary(item)),
      totalCents: items.reduce((sum, item) => sum + item.amountCents, 0),
    }
  }

  async create(
    organizationId: string,
    departureId: string,
    dto: CreateGroundIncomeDto,
  ): Promise<GroundIncomeSummary> {
    const departure = await this.findDepartureOrThrow(organizationId, departureId)
    this.ensureMutable(departure, '新增团上收入')

    const created = await this.prisma.groundIncome.create({
      data: {
        departureId: departure.id,
        title: this.normalizeTitle(dto.title),
        amountCents: dto.amountCents,
      },
    })
    return this.toSummary(created)
  }

  async update(
    organizationId: string,
    departureId: string,
    groundIncomeId: string,
    dto: UpdateGroundIncomeDto,
  ): Promise<GroundIncomeSummary> {
    const item = await this.findGroundIncomeOrThrow(
      organizationId,
      departureId,
      groundIncomeId,
    )
    this.ensureMutable(item.departure, '编辑团上收入')
    if (dto.title === undefined && dto.amountCents === undefined) {
      throw new BadRequestException('请至少提供一个待更新字段')
    }

    const updated = await this.prisma.groundIncome.update({
      where: { id: item.id },
      data: {
        ...(dto.title !== undefined ? { title: this.normalizeTitle(dto.title) } : {}),
        ...(dto.amountCents !== undefined ? { amountCents: dto.amountCents } : {}),
      },
    })
    return this.toSummary(updated)
  }

  async delete(
    organizationId: string,
    departureId: string,
    groundIncomeId: string,
  ): Promise<void> {
    const item = await this.findGroundIncomeOrThrow(
      organizationId,
      departureId,
      groundIncomeId,
    )
    this.ensureMutable(item.departure, '删除团上收入')
    await this.prisma.groundIncome.delete({ where: { id: item.id } })
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

  private async findGroundIncomeOrThrow(
    organizationId: string,
    departureId: string,
    groundIncomeId: string,
  ): Promise<GroundIncomeWithDeparture> {
    const item = await this.prisma.groundIncome.findFirst({
      where: {
        id: groundIncomeId,
        departureId,
        departure: { organizationId },
      },
      include: { departure: true },
    })
    if (!item) {
      throw new NotFoundException('团上收入不存在')
    }
    return item
  }

  private normalizeTitle(value: string): string {
    const title = value.trim()
    if (!title) {
      throw new BadRequestException('收入标题不能为空')
    }
    return title
  }

  private ensureMutable(departure: Departure, action: string): void {
    this.departureFinanceFacade.assertMutable(departure, action)
    if (departure.status === DepartureStatus.settled) {
      throw new ConflictException(`发团已结清，不可${action}`)
    }
  }

  private toSummary(item: GroundIncome): GroundIncomeSummary {
    return {
      id: item.id,
      departureId: item.departureId,
      title: item.title,
      amountCents: item.amountCents,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    }
  }
}
