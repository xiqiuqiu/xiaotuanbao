import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import type {
  PaymentScheduleListResult,
  PaymentScheduleSummary,
} from '@xiaotuanbao/shared'
import {
  deriveScheduleState,
  generateScheduleNo,
  isFinanceTouched,
  PaymentScheduleDirection as SharedPaymentScheduleDirection,
} from '@xiaotuanbao/shared'
import {
  PaymentScheduleDirection,
  type PaymentSchedule,
  type Prisma,
} from '@prisma/client'
import { PrismaService } from '../../database/prisma/prisma.service'
import { AuthService } from '../auth/auth.service'
import {
  formatDateOnly,
  getShanghaiTodayString,
  parseDateOnly,
} from '../departure/departure-date.utils'
import type {
  CancelPaymentScheduleDto,
  CreatePaymentScheduleDto,
  ListPaymentSchedulesQueryDto,
  UpdatePaymentScheduleDto,
} from './dto/payment-schedule.dto'

const FINANCE_ADJUSTMENT_FIELDS = [
  'amountCents',
  'dueDate',
  'counterpartyType',
  'counterpartyId',
  'counterpartyName',
] as const

@Injectable()
export class PaymentScheduleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  async list(
    organizationId: string,
    direction: PaymentScheduleDirection,
    query: ListPaymentSchedulesQueryDto,
  ): Promise<PaymentScheduleListResult> {
    const page = Math.max(Number(query.page) || 1, 1)
    const pageSize = Math.min(Math.max(Number(query.pageSize) || 10, 1), 100)

    const where: Prisma.PaymentScheduleWhereInput = {
      organizationId,
      direction,
      ...(query.departureId ? { departureId: query.departureId } : {}),
    }

    const [items, total] = await Promise.all([
      this.prisma.paymentSchedule.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.paymentSchedule.count({ where }),
    ])

    return {
      items: items.map((schedule) => this.toSummary(schedule)),
      total,
      page,
      pageSize,
    }
  }

  async getById(
    organizationId: string,
    direction: PaymentScheduleDirection,
    scheduleId: string,
  ): Promise<PaymentScheduleSummary> {
    const schedule = await this.findScheduleOrThrow(organizationId, direction, scheduleId)
    return this.toSummary(schedule)
  }

  async create(
    organizationId: string,
    direction: PaymentScheduleDirection,
    dto: CreatePaymentScheduleDto,
  ): Promise<PaymentScheduleSummary> {
    this.assertPositiveAmount(dto.amountCents)

    const title = dto.title.trim()
    if (!title) {
      throw new BadRequestException('节点标题不能为空')
    }

    await this.ensureDepartureExists(organizationId, dto.departureId)

    const businessDate = getShanghaiTodayString()
    const scheduleNo = await this.allocateScheduleNo(organizationId, direction, businessDate)

    const schedule = await this.prisma.paymentSchedule.create({
      data: {
        organizationId,
        departureId: dto.departureId,
        direction,
        scheduleNo,
        title,
        amountCents: dto.amountCents,
        dueDate: parseDateOnly(dto.dueDate),
        counterpartyType: dto.counterpartyType,
        counterpartyId: dto.counterpartyId?.trim() || null,
        counterpartyName: dto.counterpartyName?.trim() || null,
        sourceType: dto.sourceType?.trim() || 'manual',
        sourceId: dto.sourceId?.trim() || null,
      },
    })

    return this.toSummary(schedule)
  }

  async update(
    organizationId: string,
    direction: PaymentScheduleDirection,
    scheduleId: string,
    dto: UpdatePaymentScheduleDto,
  ): Promise<PaymentScheduleSummary> {
    const schedule = await this.findScheduleOrThrow(organizationId, direction, scheduleId)

    if (schedule.cancelledAt) {
      throw new BadRequestException('已关闭节点不可编辑')
    }

    if (!this.hasUpdateFields(dto)) {
      throw new BadRequestException('请至少提供一个待更新字段')
    }

    const touched = isFinanceTouched(schedule, 0)
    const data: Prisma.PaymentScheduleUpdateInput = {}
    let financeAdjusted = false

    if (dto.title !== undefined) {
      const title = dto.title.trim()
      if (!title) {
        throw new BadRequestException('节点标题不能为空')
      }
      data.title = title
    }

    if (dto.amountCents !== undefined) {
      this.assertPositiveAmount(dto.amountCents)
      if (touched) {
        throw new BadRequestException('财务已介入的节点不可修改金额')
      }
      data.amountCents = dto.amountCents
      financeAdjusted = true
    }

    if (dto.dueDate !== undefined) {
      if (touched) {
        throw new BadRequestException('财务已介入的节点不可修改到期日')
      }
      data.dueDate = parseDateOnly(dto.dueDate)
      financeAdjusted = true
    }

    if (dto.counterpartyType !== undefined) {
      if (touched) {
        throw new BadRequestException('财务已介入的节点不可修改往来类型')
      }
      data.counterpartyType = dto.counterpartyType
      financeAdjusted = true
    }

    if (dto.counterpartyId !== undefined) {
      if (touched) {
        throw new BadRequestException('财务已介入的节点不可修改往来对象')
      }
      data.counterpartyId = dto.counterpartyId?.trim() || null
      financeAdjusted = true
    }

    if (dto.counterpartyName !== undefined) {
      if (touched) {
        throw new BadRequestException('财务已介入的节点不可修改往来名称')
      }
      data.counterpartyName = dto.counterpartyName?.trim() || null
      financeAdjusted = true
    }

    if (financeAdjusted) {
      data.amountAdjustedAt = new Date()
    }

    const updated = await this.prisma.paymentSchedule.update({
      where: { id: schedule.id },
      data,
    })

    return this.toSummary(updated)
  }

  async cancel(
    organizationId: string,
    scheduleId: string,
    userId: string,
    dto: CancelPaymentScheduleDto,
  ): Promise<PaymentScheduleSummary> {
    const schedule = await this.prisma.paymentSchedule.findFirst({
      where: { id: scheduleId, organizationId },
    })

    if (!schedule) {
      throw new NotFoundException('收付款节点不存在')
    }

    const menuKey =
      schedule.direction === PaymentScheduleDirection.receivable
        ? '/finance/receivable'
        : '/finance/payable'
    const menuKeys = await this.authService.getMenuKeysForUser(userId)
    if (!menuKeys.includes(menuKey)) {
      throw new ForbiddenException('无权访问')
    }

    if (schedule.cancelledAt) {
      throw new BadRequestException('节点已关闭')
    }

    const updated = await this.prisma.paymentSchedule.update({
      where: { id: schedule.id },
      data: {
        cancelledAt: new Date(),
        cancelReason: dto.cancelReason?.trim() || null,
      },
    })

    return this.toSummary(updated)
  }

  private hasUpdateFields(dto: UpdatePaymentScheduleDto): boolean {
    return (
      dto.title !== undefined ||
      FINANCE_ADJUSTMENT_FIELDS.some((field) => dto[field] !== undefined)
    )
  }

  private assertPositiveAmount(amountCents: number) {
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      throw new BadRequestException('金额必须大于 0')
    }
  }

  private async ensureDepartureExists(organizationId: string, departureId: string) {
    const departure = await this.prisma.departure.findFirst({
      where: { id: departureId, organizationId },
    })

    if (!departure) {
      throw new NotFoundException('发团不存在')
    }
  }

  private async findScheduleOrThrow(
    organizationId: string,
    direction: PaymentScheduleDirection,
    scheduleId: string,
  ) {
    const schedule = await this.prisma.paymentSchedule.findFirst({
      where: { id: scheduleId, organizationId, direction },
    })

    if (!schedule) {
      throw new NotFoundException('收付款节点不存在')
    }

    return schedule
  }

  private async allocateScheduleNo(
    organizationId: string,
    direction: PaymentScheduleDirection,
    businessDate: string,
  ): Promise<string> {
    const prefix =
      direction === PaymentScheduleDirection.receivable
        ? SharedPaymentScheduleDirection.RECEIVABLE
        : SharedPaymentScheduleDirection.PAYABLE
    const datePart = businessDate.replace(/-/g, '')
    const scheduleNoPrefix =
      direction === PaymentScheduleDirection.receivable ? `AR${datePart}` : `AP${datePart}`

    const latest = await this.prisma.paymentSchedule.findFirst({
      where: {
        organizationId,
        direction,
        scheduleNo: { startsWith: scheduleNoPrefix },
      },
      orderBy: { scheduleNo: 'desc' },
      select: { scheduleNo: true },
    })

    const lastSequence = latest ? Number(latest.scheduleNo.slice(-4)) : 0
    return generateScheduleNo(prefix, businessDate, lastSequence + 1)
  }

  private toSummary(schedule: PaymentSchedule): PaymentScheduleSummary {
    const businessDate = getShanghaiTodayString()
    const settledAmountCents = 0

    return {
      id: schedule.id,
      departureId: schedule.departureId,
      direction: schedule.direction,
      scheduleNo: schedule.scheduleNo,
      title: schedule.title,
      amountCents: schedule.amountCents,
      dueDate: formatDateOnly(schedule.dueDate),
      counterpartyType: schedule.counterpartyType,
      counterpartyId: schedule.counterpartyId,
      counterpartyName: schedule.counterpartyName,
      sourceType: schedule.sourceType,
      sourceId: schedule.sourceId,
      status: deriveScheduleState({
        amountCents: schedule.amountCents,
        settledAmountCents,
        dueDate: formatDateOnly(schedule.dueDate),
        cancelledAt: schedule.cancelledAt,
        businessDate,
      }),
      financeTouched: isFinanceTouched(schedule, settledAmountCents),
      cancelledAt: schedule.cancelledAt?.toISOString() ?? null,
      cancelReason: schedule.cancelReason,
      amountAdjustedAt: schedule.amountAdjustedAt?.toISOString() ?? null,
      createdAt: schedule.createdAt.toISOString(),
      updatedAt: schedule.updatedAt.toISOString(),
    }
  }
}
