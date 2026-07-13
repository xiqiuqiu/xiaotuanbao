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
  PaymentScheduleSourceType,
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
  AdjustPaymentScheduleAmountDto,
  CancelPaymentScheduleDto,
  CreatePaymentScheduleDto,
  ListPaymentSchedulesQueryDto,
  ReopenPaymentScheduleDto,
  UpdatePaymentScheduleDto,
} from './dto/payment-schedule.dto'
import { buildPaymentScheduleCounterpartyWhere } from './payment-schedule-list-filters'

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
    const counterpartyWhere = buildPaymentScheduleCounterpartyWhere(query)

    const where: Prisma.PaymentScheduleWhereInput = {
      organizationId,
      direction,
      ...(query.departureId ? { departureId: query.departureId } : {}),
      ...counterpartyWhere,
    }

    const [items, total] = await Promise.all([
      this.prisma.paymentSchedule.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { departure: { select: { status: true } } },
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
          schedule.departure.status,
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
    const [settledAmountCents, hasVerificationHistory, activities, departureStatus] =
      await Promise.all([
        this.verificationService.getSettledAmountCents(schedule.id),
        this.verificationService.hasVerificationHistory(schedule.id),
        this.loadActivities(schedule.id),
        this.departureFinanceFacade.getStatusById(organizationId, schedule.departureId),
      ])
    return {
      ...this.toSummary(schedule, settledAmountCents, hasVerificationHistory, departureStatus),
      activities,
    }
  }

  async create(
    organizationId: string,
    direction: PaymentScheduleDirection,
    dto: CreatePaymentScheduleDto,
    tx?: Prisma.TransactionClient,
  ): Promise<PaymentScheduleSummary> {
    if (!tx) {
      return this.prisma.$transaction((transaction) =>
        this.create(organizationId, direction, dto, transaction),
      )
    }
    const client = tx
    this.assertPositiveAmount(dto.amountCents)

    const title = dto.title.trim()
    if (!title) {
      throw new BadRequestException('节点标题不能为空')
    }

    await this.departureFinanceFacade.lockMutableById(
      client,
      organizationId,
      dto.departureId,
      '创建收付款节点',
    )

    const scheduleNo = await this.numberAllocationService.allocateScheduleNo(
      organizationId,
      direction,
      client,
    )

    const schedule = await client.paymentSchedule.create({
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

    const departureStatus = await this.departureFinanceFacade.getStatusById(
      organizationId,
      schedule.departureId,
    )
    return this.toSummary(schedule, 0, false, departureStatus)
  }

  async update(
    organizationId: string,
    direction: PaymentScheduleDirection,
    scheduleId: string,
    dto: UpdatePaymentScheduleDto,
    client?: Prisma.TransactionClient,
  ): Promise<PaymentScheduleSummary> {
    if (!this.hasUpdateFields(dto)) {
      throw new BadRequestException('请至少提供一个待更新字段')
    }

    const run = async (tx: Prisma.TransactionClient) => {
      await tx.$queryRaw`
        SELECT id
        FROM payment_schedules
        WHERE id = ${scheduleId}
          AND organization_id = ${organizationId}
        FOR UPDATE
      `

      const schedule = await tx.paymentSchedule.findFirst({
        where: { id: scheduleId, organizationId, direction },
      })
      if (!schedule) {
        throw new NotFoundException('收付款节点不存在')
      }

      await this.departureFinanceFacade.lockMutableById(
        tx,
        organizationId,
        schedule.departureId,
        '编辑收付款节点',
      )
      if (schedule.cancelledAt) {
        throw new BadRequestException('已关闭节点不可编辑')
      }

      const [settledAmountCents, hasVerificationHistory] = await Promise.all([
        this.verificationService.getSettledAmountCents(schedule.id, tx),
        this.verificationService.hasVerificationHistory(schedule.id, tx),
      ])
      const touched = isFinanceTouched(schedule, settledAmountCents, hasVerificationHistory)
      const data: Prisma.PaymentScheduleUpdateInput = {}

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
      }
      if (dto.dueDate !== undefined) {
        if (touched) {
          throw new BadRequestException('财务已介入的节点不可修改到期日')
        }
        data.dueDate = parseDateOnly(dto.dueDate)
      }
      if (dto.counterpartyType !== undefined) {
        if (touched) {
          throw new BadRequestException('财务已介入的节点不可修改往来类型')
        }
        data.counterpartyType = dto.counterpartyType
      }
      if (dto.counterpartyId !== undefined) {
        if (touched) {
          throw new BadRequestException('财务已介入的节点不可修改往来对象')
        }
        data.counterpartyId = dto.counterpartyId?.trim() || null
      }
      if (dto.counterpartyName !== undefined) {
        if (touched) {
          throw new BadRequestException('财务已介入的节点不可修改往来名称')
        }
        data.counterpartyName = dto.counterpartyName?.trim() || null
      }

      // Ordinary edit must not set amountAdjustedAt — that field is reserved for
      // explicit adjust-amount and would falsely mark financeTouched (ADR-0010).
      if (dto.amountCents !== undefined && dto.amountCents !== schedule.amountCents) {
        await this.syncSourceAmountOnOrdinaryEdit(tx, schedule, dto.amountCents)
      }

      const updated = await tx.paymentSchedule.update({
        where: { id: schedule.id },
        data,
      })
      return {
        updated,
        settledAmountCents,
        hasVerificationHistory,
        departureId: schedule.departureId,
      }
    }
    const result = client ? await run(client) : await this.prisma.$transaction(run)

    const departureStatus = await this.departureFinanceFacade.getStatusById(
      organizationId,
      result.departureId,
    )
    return this.toSummary(
      result.updated,
      result.settledAmountCents,
      result.hasVerificationHistory,
      departureStatus,
    )
  }

  async cancel(
    organizationId: string,
    scheduleId: string,
    userId: string,
    dto: CancelPaymentScheduleDto,
    client?: Prisma.TransactionClient,
  ): Promise<PaymentScheduleSummary> {
    const cancelReason = dto.cancelReason?.trim()
    if (!cancelReason) {
      throw new BadRequestException('关闭说明不能为空')
    }
    if (!dto.closeDisposition) {
      throw new BadRequestException('关闭处置类型不能为空')
    }

    const run = async (tx: Prisma.TransactionClient) => {
      await tx.$queryRaw`
        SELECT id
        FROM payment_schedules
        WHERE id = ${scheduleId}
          AND organization_id = ${organizationId}
        FOR UPDATE
      `

      const schedule = await tx.paymentSchedule.findFirst({
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

      await this.departureFinanceFacade.lockMutableById(
        tx,
        organizationId,
        schedule.departureId,
        '关闭收付款节点',
      )

      const [settledAmountCents, hasVerificationHistory] = await Promise.all([
        this.verificationService.getSettledAmountCents(schedule.id, tx),
        this.verificationService.hasVerificationHistory(schedule.id, tx),
      ])
      const unsettledAmountCents = schedule.amountCents - settledAmountCents
      if (unsettledAmountCents <= 0) {
        throw new BadRequestException('已结清节点不可关闭')
      }

      const cancelledAt = new Date()
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

      return {
        updated: closed,
        settledAmountCents,
        hasVerificationHistory,
        departureId: schedule.departureId,
      }
    }
    const result = client ? await run(client) : await this.prisma.$transaction(run)

    const departureStatus = await this.departureFinanceFacade.getStatusById(
      organizationId,
      result.departureId,
    )
    return this.toSummary(
      result.updated,
      result.settledAmountCents,
      result.hasVerificationHistory,
      departureStatus,
    )
  }

  async reopen(
    organizationId: string,
    scheduleId: string,
    userId: string,
    dto: ReopenPaymentScheduleDto,
    client?: Prisma.TransactionClient,
  ): Promise<PaymentScheduleSummary> {
    const reopenReason = dto.reopenReason?.trim()
    if (!reopenReason) {
      throw new BadRequestException('重新打开原因不能为空')
    }

    const run = async (tx: Prisma.TransactionClient) => {
      await tx.$queryRaw`
        SELECT id
        FROM payment_schedules
        WHERE id = ${scheduleId}
          AND organization_id = ${organizationId}
        FOR UPDATE
      `

      const schedule = await tx.paymentSchedule.findFirst({
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
      if (!schedule.cancelledAt) {
        throw new BadRequestException('仅已关闭节点可以重新打开')
      }

      await this.departureFinanceFacade.lockMutableById(
        tx,
        organizationId,
        schedule.departureId,
        '重新打开收付款节点，请先解除归档',
      )

      const [settledAmountCents, hasVerificationHistory] = await Promise.all([
        this.verificationService.getSettledAmountCents(schedule.id, tx),
        this.verificationService.hasVerificationHistory(schedule.id, tx),
      ])
      const unsettledAmountCents = schedule.amountCents - settledAmountCents
      const operatedAt = new Date()

      const updated = await tx.paymentSchedule.update({
        where: { id: schedule.id },
        data: {
          cancelledAt: null,
          cancelledBy: null,
          closeDisposition: null,
          cancelReason: null,
        },
      })

      await tx.paymentScheduleActivity.create({
        data: {
          organizationId,
          paymentScheduleId: schedule.id,
          activityType: PaymentScheduleActivityType.reopen,
          note: reopenReason,
          amountCents: schedule.amountCents,
          settledAmountCents,
          unsettledAmountCents,
          operatedBy: userId,
          operatedAt,
        },
      })

      const nextDepartureStatus =
        await this.departureFinanceFacade.reverseSettlementOnScheduleReopen(tx, {
          organizationId,
          departureId: schedule.departureId,
          triggerPaymentScheduleId: schedule.id,
          reason: reopenReason,
          operatedBy: userId,
          operatedAt,
          confirmDepartureSettlementReversal: dto.confirmDepartureSettlementReversal,
        })

      return {
        reopened: updated,
        settledAmountCents,
        hasVerificationHistory,
        departureStatus: nextDepartureStatus,
      }
    }
    const result = client ? await run(client) : await this.prisma.$transaction(run)

    return this.toSummary(
      result.reopened,
      result.settledAmountCents,
      result.hasVerificationHistory,
      result.departureStatus,
    )
  }

  async adjustAmount(
    organizationId: string,
    scheduleId: string,
    userId: string,
    dto: AdjustPaymentScheduleAmountDto,
    client?: Prisma.TransactionClient,
  ): Promise<PaymentScheduleSummary> {
    this.assertPositiveAmount(dto.amountCents)

    const adjustReason = dto.adjustReason?.trim()
    if (!adjustReason) {
      throw new BadRequestException('调整原因不能为空')
    }

    const run = async (tx: Prisma.TransactionClient) => {
      await tx.$queryRaw`
        SELECT id
        FROM payment_schedules
        WHERE id = ${scheduleId}
          AND organization_id = ${organizationId}
        FOR UPDATE
      `

      const schedule = await tx.paymentSchedule.findFirst({
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

      const isPayableResource =
        schedule.direction === PaymentScheduleDirection.payable &&
        schedule.sourceType === PaymentScheduleSourceType.SEGMENT_RESOURCE &&
        Boolean(schedule.sourceId)
      const isReceivableSourcePath =
        schedule.direction === PaymentScheduleDirection.receivable &&
        (schedule.sourceType === PaymentScheduleSourceType.SOURCE_ORDER_CUSTOMER_SETTLEMENT ||
          schedule.sourceType === PaymentScheduleSourceType.SOURCE_ORDER_GUEST_COLLECTION) &&
        Boolean(schedule.sourceId)

      if (!isPayableResource && !isReceivableSourcePath) {
        throw new BadRequestException('仅资源应付或客源应收节点可调整约定金额')
      }
      if (schedule.cancelledAt) {
        throw new BadRequestException('已关闭节点不可调整约定金额')
      }
      if (schedule.amountCents === dto.amountCents) {
        throw new BadRequestException('新约定金额必须与当前金额不同')
      }

      await this.departureFinanceFacade.lockMutableById(
        tx,
        organizationId,
        schedule.departureId,
        '调整约定金额',
      )

      const settledAmountCents = await this.verificationService.getSettledAmountCents(
        schedule.id,
        tx,
      )
      const hasVerificationHistory = await this.verificationService.hasVerificationHistory(
        schedule.id,
        tx,
      )
      if (settledAmountCents > 0) {
        throw new BadRequestException('仍有有效核销时不可调整约定金额，请先撤销相关核销')
      }
      if (!isFinanceTouched(schedule, settledAmountCents, hasVerificationHistory)) {
        throw new BadRequestException('无财务履历时请通过普通编辑修改金额')
      }

      const previousAmountCents = schedule.amountCents
      const operatedAt = new Date()
      const unsettledAmountCents = dto.amountCents - settledAmountCents

      if (isPayableResource) {
        await this.departureFinanceFacade.syncSegmentResourceAmountOnPayableAdjust(tx, {
          resourceId: schedule.sourceId!,
          amountCents: dto.amountCents,
        })
      } else {
        await this.departureFinanceFacade.syncSourceOrderPathAmountOnReceivableAdjust(tx, {
          sourceOrderId: schedule.sourceId!,
          sourceType: schedule.sourceType,
          amountCents: dto.amountCents,
        })
      }

      const nextSchedule = await tx.paymentSchedule.update({
        where: { id: schedule.id },
        data: {
          amountCents: dto.amountCents,
          amountAdjustedAt: operatedAt,
        },
      })

      await tx.paymentScheduleActivity.create({
        data: {
          organizationId,
          paymentScheduleId: schedule.id,
          activityType: PaymentScheduleActivityType.amount_adjust,
          note: adjustReason,
          previousAmountCents,
          amountCents: dto.amountCents,
          settledAmountCents,
          unsettledAmountCents,
          operatedBy: userId,
          operatedAt,
        },
      })

      return {
        updated: nextSchedule,
        settledAmountCents,
        hasVerificationHistory,
        departureId: schedule.departureId,
      }
    }
    const result = client ? await run(client) : await this.prisma.$transaction(run)

    const departureStatus = await this.departureFinanceFacade.getStatusById(
      organizationId,
      result.departureId,
    )
    return this.toSummary(
      result.updated,
      result.settledAmountCents,
      result.hasVerificationHistory,
      departureStatus,
    )
  }

  private hasUpdateFields(dto: UpdatePaymentScheduleDto): boolean {
    return (
      dto.title !== undefined ||
      FINANCE_ADJUSTMENT_FIELDS.some((field) => dto[field] !== undefined)
    )
  }

  /**
   * Keep source facts aligned with ordinary (pre-finance-touch) amount edits.
   * Explicit adjust-amount uses the same facade helpers and also sets amountAdjustedAt.
   */
  private async syncSourceAmountOnOrdinaryEdit(
    tx: Prisma.TransactionClient,
    schedule: PaymentSchedule,
    amountCents: number,
  ): Promise<void> {
    const isPayableResource =
      schedule.direction === PaymentScheduleDirection.payable &&
      schedule.sourceType === PaymentScheduleSourceType.SEGMENT_RESOURCE &&
      Boolean(schedule.sourceId)
    const isReceivableSourcePath =
      schedule.direction === PaymentScheduleDirection.receivable &&
      (schedule.sourceType === PaymentScheduleSourceType.SOURCE_ORDER_CUSTOMER_SETTLEMENT ||
        schedule.sourceType === PaymentScheduleSourceType.SOURCE_ORDER_GUEST_COLLECTION) &&
      Boolean(schedule.sourceId)

    if (isPayableResource) {
      await this.departureFinanceFacade.syncSegmentResourceAmountOnPayableAdjust(tx, {
        resourceId: schedule.sourceId!,
        amountCents,
      })
      return
    }

    if (isReceivableSourcePath) {
      await this.departureFinanceFacade.syncSourceOrderPathAmountOnReceivableAdjust(tx, {
        sourceOrderId: schedule.sourceId!,
        sourceType: schedule.sourceType,
        amountCents,
      })
    }
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
      previousAmountCents: row.previousAmountCents,
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
    departureStatus: string,
  ): PaymentScheduleSummary {
    const businessDate = getShanghaiTodayString()
    const unsettledAmountCents = Math.max(schedule.amountCents - settledAmountCents, 0)

    return {
      id: schedule.id,
      departureId: schedule.departureId,
      departureStatus,
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
