import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import type {
  PaymentScheduleActivityItem,
  PaymentScheduleDetail,
  PaymentScheduleListResult,
  PaymentScheduleSummary,
} from '@xiaotuanbao/shared'
import {
  deriveScheduleState,
  isFinanceTouched,
} from '@xiaotuanbao/shared'
import {
  PaymentScheduleActivityType,
  PaymentScheduleDirection,
  type PaymentSchedule,
  type PaymentScheduleActivity,
  type Prisma,
} from '@prisma/client'
import { PrismaService } from '../../database/prisma/prisma.service'
import { AuthService } from '../auth/auth.service'
import { NumberAllocationService } from '../number-allocation/number-allocation.service'
import { DepartureFinanceFacade } from './departure-finance-facade.service'
import { VerificationService } from './verification.service'
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
    private readonly verificationService: VerificationService,
    private readonly numberAllocationService: NumberAllocationService,
    private readonly departureFinanceFacade: DepartureFinanceFacade,
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

    const settledMap = await this.verificationService.batchGetSettledAmounts(
      items.map((schedule) => schedule.id),
    )
    const historyMap = await this.verificationService.batchHasVerificationHistory(
      items.map((schedule) => schedule.id),
    )

    return {
      items: items.map((schedule) =>
        this.toSummary(
          schedule,
          settledMap.get(schedule.id) ?? 0,
          historyMap.get(schedule.id) ?? false,
        ),
      ),
      total,
      page,
      pageSize,
    }
  }

  async getById(
    organizationId: string,
    direction: PaymentScheduleDirection,
    scheduleId: string,
  ): Promise<PaymentScheduleDetail> {
    const schedule = await this.findScheduleOrThrow(organizationId, direction, scheduleId)
    const [settledAmountCents, hasVerificationHistory, activities] = await Promise.all([
      this.verificationService.getSettledAmountCents(schedule.id),
      this.verificationService.hasVerificationHistory(schedule.id),
      this.loadActivities(schedule.id),
    ])
    return {
      ...this.toSummary(schedule, settledAmountCents, hasVerificationHistory),
      activities,
    }
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

    await this.departureFinanceFacade.assertMutableById(
      organizationId,
      dto.departureId,
      '创建收付款节点',
    )

    const scheduleNo = await this.numberAllocationService.allocateScheduleNo(
      organizationId,
      direction,
    )

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

    return this.toSummary(schedule, 0, false)
  }

  async update(
    organizationId: string,
    direction: PaymentScheduleDirection,
    scheduleId: string,
    dto: UpdatePaymentScheduleDto,
  ): Promise<PaymentScheduleSummary> {
    const schedule = await this.findScheduleOrThrow(organizationId, direction, scheduleId)

    await this.departureFinanceFacade.assertMutableById(
      organizationId,
      schedule.departureId,
      '编辑收付款节点',
    )

    if (schedule.cancelledAt) {
      throw new BadRequestException('已关闭节点不可编辑')
    }

    if (!this.hasUpdateFields(dto)) {
      throw new BadRequestException('请至少提供一个待更新字段')
    }

    const [settledAmountCents, hasVerificationHistory] = await Promise.all([
      this.verificationService.getSettledAmountCents(schedule.id),
      this.verificationService.hasVerificationHistory(schedule.id),
    ])
    const touched = isFinanceTouched(schedule, settledAmountCents, hasVerificationHistory)
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

    return this.toSummary(updated, settledAmountCents, hasVerificationHistory)
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

    const cancelReason = dto.cancelReason?.trim()
    if (!cancelReason) {
      throw new BadRequestException('关闭说明不能为空')
    }
    if (!dto.closeDisposition) {
      throw new BadRequestException('关闭处置类型不能为空')
    }

    await this.departureFinanceFacade.assertMutableById(
      organizationId,
      schedule.departureId,
      '关闭收付款节点',
    )

    const [settledAmountCents, hasVerificationHistory] = await Promise.all([
      this.verificationService.getSettledAmountCents(schedule.id),
      this.verificationService.hasVerificationHistory(schedule.id),
    ])
    const unsettledAmountCents = Math.max(schedule.amountCents - settledAmountCents, 0)
    if (unsettledAmountCents <= 0) {
      throw new BadRequestException('已结清节点不可关闭')
    }

    const cancelledAt = new Date()
    const updated = await this.prisma.$transaction(async (tx) => {
      const closed = await tx.paymentSchedule.update({
        where: { id: schedule.id },
        data: {
          cancelledAt,
          cancelledBy: userId,
          closeDisposition: dto.closeDisposition,
          cancelReason,
        },
      })

      await tx.paymentScheduleActivity.create({
        data: {
          organizationId,
          paymentScheduleId: schedule.id,
          activityType: PaymentScheduleActivityType.close,
          closeDisposition: dto.closeDisposition,
          note: cancelReason,
          amountCents: schedule.amountCents,
          settledAmountCents,
          unsettledAmountCents,
          operatedBy: userId,
          operatedAt: cancelledAt,
        },
      })

      return closed
    })

    return this.toSummary(updated, settledAmountCents, hasVerificationHistory)
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

  private async loadActivities(paymentScheduleId: string): Promise<PaymentScheduleActivityItem[]> {
    const rows = await this.prisma.paymentScheduleActivity.findMany({
      where: { paymentScheduleId },
      include: { operator: { select: { name: true } } },
      orderBy: { operatedAt: 'asc' },
    })
    return rows.map((row) => this.toActivityItem(row))
  }

  private toActivityItem(
    row: PaymentScheduleActivity & { operator: { name: string } },
  ): PaymentScheduleActivityItem {
    return {
      id: row.id,
      activityType: row.activityType,
      closeDisposition: row.closeDisposition,
      note: row.note,
      amountCents: row.amountCents,
      settledAmountCents: row.settledAmountCents,
      unsettledAmountCents: row.unsettledAmountCents,
      previousSettledAmountCents: row.previousSettledAmountCents,
      previousUnsettledAmountCents: row.previousUnsettledAmountCents,
      verificationId: row.verificationId,
      operatedBy: row.operatedBy,
      operatedByName: row.operator.name,
      operatedAt: row.operatedAt.toISOString(),
    }
  }

  private toSummary(
    schedule: PaymentSchedule,
    settledAmountCents: number,
    hasVerificationHistory = settledAmountCents > 0,
  ): PaymentScheduleSummary {
    const businessDate = getShanghaiTodayString()
    const unsettledAmountCents = Math.max(schedule.amountCents - settledAmountCents, 0)

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
      financeTouched: isFinanceTouched(schedule, settledAmountCents, hasVerificationHistory),
      settledAmountCents,
      unsettledAmountCents,
      cancelledAt: schedule.cancelledAt?.toISOString() ?? null,
      cancelledBy: schedule.cancelledBy,
      closeDisposition: schedule.closeDisposition,
      cancelReason: schedule.cancelReason,
      amountAdjustedAt: schedule.amountAdjustedAt?.toISOString() ?? null,
      createdAt: schedule.createdAt.toISOString(),
      updatedAt: schedule.updatedAt.toISOString(),
    }
  }
}
