import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import type {
  FinanceTransactionSummary,
  FinanceVerificationDetail,
  FinanceVerificationListItem,
  FinanceVerificationListResult,
  FinanceVerificationSummary,
  PaymentScheduleSummary,
} from '@xiaotuanbao/shared'
import {
  assertCounterpartyMatch,
  assertDirectionMatch,
  CounterpartyMismatchError,
  deriveScheduleState,
  DirectionMismatchError,
  isFinanceTouched,
  PaymentChannel,
  TransactionDirection,
  VerificationStatus,
} from '@xiaotuanbao/shared'
import {
  PaymentChannel as PrismaPaymentChannel,
  PaymentScheduleActivityType,
  PaymentScheduleDirection,
  TransactionDirection as PrismaTransactionDirection,
  VerificationStatus as PrismaVerificationStatus,
  type FinanceTransaction,
  type PaymentSchedule,
  type Prisma,
} from '@prisma/client'
import {
  formatDateOnly,
  getShanghaiTodayString,
  parseDateOnly,
} from '../departure/departure-date.utils'
import { PrismaService } from '../../database/prisma/prisma.service'
import { NumberAllocationService } from '../number-allocation/number-allocation.service'
import { DepartureFinanceFacade } from './departure-finance-facade.service'
import type {
  CancelFinanceVerificationDto,
  CreateFinanceVerificationDto,
  ListFinanceVerificationsQueryDto,
} from './dto/verification.dto'

export interface VerificationCreateContext {
  createdBy: string
}

type VerificationWithRelations = Prisma.FinanceVerificationGetPayload<{
  include: {
    paymentSchedule: {
      select: {
        scheduleNo: true
        direction: true
        counterpartyType: true
        counterpartyId: true
        counterpartyName: true
        departureId: true
        departure: { select: { departureNo: true; name: true } }
      }
    }
    transaction: { select: { transactionNo: true } }
  }
}>

@Injectable()
export class VerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numberAllocationService: NumberAllocationService,
    private readonly departureFinanceFacade: DepartureFinanceFacade,
  ) {}

  async list(
    organizationId: string,
    query: ListFinanceVerificationsQueryDto,
  ): Promise<FinanceVerificationListResult> {
    const page = Math.max(Number(query.page) || 1, 1)
    const pageSize = Math.min(Math.max(Number(query.pageSize) || 10, 1), 100)

    const where = this.buildListWhere(organizationId, query)

    const [items, total] = await Promise.all([
      this.prisma.financeVerification.findMany({
        where,
        include: {
          paymentSchedule: {
            select: {
              scheduleNo: true,
              direction: true,
              counterpartyType: true,
              counterpartyId: true,
              counterpartyName: true,
              departureId: true,
              departure: { select: { departureNo: true, name: true } },
            },
          },
          transaction: { select: { transactionNo: true } },
        },
        orderBy: [{ verificationDate: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.financeVerification.count({ where }),
    ])

    const userNames = await this.batchGetUserNames(
      items.flatMap((item) => [item.createdBy, item.cancelledBy].filter(Boolean) as string[]),
    )

    return {
      items: items.map((item) => this.toListItem(item, userNames)),
      total,
      page,
      pageSize,
    }
  }

  async getDetail(organizationId: string, verificationId: string): Promise<FinanceVerificationDetail> {
    const verification = await this.prisma.financeVerification.findFirst({
      where: { id: verificationId, organizationId },
      include: {
        paymentSchedule: {
          select: {
            scheduleNo: true,
            direction: true,
            counterpartyType: true,
            counterpartyId: true,
            counterpartyName: true,
            departureId: true,
            departure: { select: { departureNo: true, name: true } },
          },
        },
        transaction: { select: { transactionNo: true } },
      },
    })

    if (!verification) {
      throw new NotFoundException('核销记录不存在')
    }

    const userNames = await this.batchGetUserNames(
      [verification.createdBy, verification.cancelledBy].filter(Boolean) as string[],
    )

    const [transaction, schedule] = await Promise.all([
      this.buildTransactionSummary(organizationId, verification.transactionId),
      this.buildScheduleSummary(organizationId, verification.paymentScheduleId),
    ])

    return {
      verification: this.toListItem(verification, userNames),
      transaction,
      schedule,
    }
  }

  async create(
    organizationId: string,
    dto: CreateFinanceVerificationDto,
    context: VerificationCreateContext,
    tx?: Prisma.TransactionClient,
  ): Promise<FinanceVerificationSummary> {
    if (!tx) {
      return this.prisma.$transaction((transaction) =>
        this.create(organizationId, dto, context, transaction),
      )
    }

    const client = tx
    this.assertPositiveAmount(dto.amountCents)

    await this.lockAllocationInputs(
      client,
      organizationId,
      dto.paymentScheduleId,
      dto.transactionId,
    )

    const schedule = await client.paymentSchedule.findFirst({
      where: { id: dto.paymentScheduleId, organizationId },
    })
    if (!schedule) {
      throw new NotFoundException('收付款节点不存在')
    }
    if (schedule.cancelledAt) {
      throw new BadRequestException('已关闭节点不可核销')
    }

    await this.departureFinanceFacade.lockMutableById(
      client,
      organizationId,
      schedule.departureId,
      '创建核销',
    )

    const transaction = await client.financeTransaction.findFirst({
      where: { id: dto.transactionId, organizationId },
    })
    if (!transaction) {
      throw new NotFoundException('流水不存在')
    }
    if (transaction.voidedAt) {
      throw new BadRequestException('流水已作废，不可关联')
    }

    try {
      assertDirectionMatch(schedule.direction, transaction.direction)
    } catch (error) {
      if (error instanceof DirectionMismatchError) {
        throw new BadRequestException(error.message)
      }
      throw error
    }

    try {
      assertCounterpartyMatch(schedule, transaction)
    } catch (error) {
      if (error instanceof CounterpartyMismatchError) {
        throw new BadRequestException(error.message)
      }
      throw error
    }

    const settled = await this.getSettledAmountCents(schedule.id, client)
    await this.assertScheduleAllocation(client, schedule.id, schedule.amountCents, dto.amountCents)
    await this.assertTransactionAllocation(
      client,
      transaction.id,
      transaction.amountCents,
      dto.amountCents,
    )

    const billUnsettledAfterCents = schedule.amountCents - settled - dto.amountCents

    const verificationNo = await this.numberAllocationService.allocateVerificationNo(
      organizationId,
      client,
    )

    const verification = await client.financeVerification.create({
      data: {
        organizationId,
        verificationNo,
        paymentScheduleId: dto.paymentScheduleId,
        transactionId: dto.transactionId,
        amountCents: dto.amountCents,
        verificationDate: parseDateOnly(dto.verificationDate),
        remark: dto.remark?.trim() || null,
        createdBy: context.createdBy,
        billUnsettledAfterCents,
        status: PrismaVerificationStatus.normal,
      },
    })

    return this.toSummary(verification)
  }

  private async lockAllocationInputs(
    tx: Prisma.TransactionClient,
    organizationId: string,
    paymentScheduleId: string,
    transactionId: string,
  ): Promise<void> {
    await tx.$queryRaw`
      SELECT id
      FROM payment_schedules
      WHERE id = ${paymentScheduleId}
        AND organization_id = ${organizationId}
      FOR UPDATE
    `
    await tx.$queryRaw`
      SELECT id
      FROM finance_transactions
      WHERE id = ${transactionId}
        AND organization_id = ${organizationId}
      FOR UPDATE
    `
  }

  async cancel(
    organizationId: string,
    verificationId: string,
    dto: CancelFinanceVerificationDto,
    cancelledBy: string,
    client?: Prisma.TransactionClient,
  ): Promise<FinanceVerificationSummary> {
    const cancelReason = dto.cancelReason?.trim()
    if (!cancelReason) {
      throw new BadRequestException('撤销原因不能为空')
    }

    const run = async (tx: Prisma.TransactionClient) => {
      await tx.$queryRaw`
        SELECT id
        FROM finance_verifications
        WHERE id = ${verificationId}
          AND organization_id = ${organizationId}
        FOR UPDATE
      `

      const verification = await tx.financeVerification.findFirst({
        where: { id: verificationId, organizationId },
      })
      if (!verification) {
        throw new NotFoundException('核销记录不存在')
      }
      if (verification.status === PrismaVerificationStatus.cancelled) {
        throw new BadRequestException('核销已撤销')
      }

      const schedule = await tx.paymentSchedule.findFirst({
        where: { id: verification.paymentScheduleId, organizationId },
        select: {
          id: true,
          departureId: true,
          amountCents: true,
          cancelledAt: true,
        },
      })
      if (!schedule) {
        throw new NotFoundException('收付款节点不存在')
      }

      await this.departureFinanceFacade.lockMutableById(
        tx,
        organizationId,
        schedule.departureId,
        '撤销核销',
      )

      const previousSettledAmountCents = await this.getSettledAmountCents(schedule.id, tx)
      const previousUnsettledAmountCents = Math.max(
        schedule.amountCents - previousSettledAmountCents,
        0,
      )

      const operatedAt = new Date()
      const cancelled = await tx.financeVerification.update({
        where: { id: verification.id },
        data: {
          status: PrismaVerificationStatus.cancelled,
          cancelledAt: operatedAt,
          cancelledBy,
          cancelReason,
        },
      })

      if (!schedule.cancelledAt) {
        await this.departureFinanceFacade.reverseSettlementOnVerificationCancel(tx, {
          organizationId,
          departureId: schedule.departureId,
          triggerPaymentScheduleId: schedule.id,
          reason: cancelReason,
          operatedBy: cancelledBy,
          operatedAt,
        })
      }

      if (schedule.cancelledAt) {
        const settledResult = await tx.financeVerification.aggregate({
          where: {
            paymentScheduleId: schedule.id,
            status: PrismaVerificationStatus.normal,
          },
          _sum: { amountCents: true },
        })
        const settledAmountCents = settledResult._sum.amountCents ?? 0
        const unsettledAmountCents = Math.max(schedule.amountCents - settledAmountCents, 0)
        await tx.paymentScheduleActivity.create({
          data: {
            organizationId,
            paymentScheduleId: schedule.id,
            activityType: PaymentScheduleActivityType.verification_cancelled,
            note: cancelReason,
            amountCents: schedule.amountCents,
            settledAmountCents,
            unsettledAmountCents,
            previousSettledAmountCents,
            previousUnsettledAmountCents,
            verificationId: verification.id,
            operatedBy: cancelledBy,
            operatedAt,
          },
        })
      }

      return cancelled
    }
    const updated = client ? await run(client) : await this.prisma.$transaction(run)

    return this.toSummary(updated)
  }

  async getSettledAmountCents(
    scheduleId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const client = tx ?? this.prisma
    const result = await client.financeVerification.aggregate({
      where: {
        paymentScheduleId: scheduleId,
        status: PrismaVerificationStatus.normal,
      },
      _sum: { amountCents: true },
    })
    return result._sum.amountCents ?? 0
  }

  async batchGetSettledAmounts(scheduleIds: string[]): Promise<Map<string, number>> {
    if (scheduleIds.length === 0) {
      return new Map()
    }

    const rows = await this.prisma.financeVerification.groupBy({
      by: ['paymentScheduleId'],
      where: {
        paymentScheduleId: { in: scheduleIds },
        status: PrismaVerificationStatus.normal,
      },
      _sum: { amountCents: true },
    })

    const map = new Map<string, number>()
    for (const row of rows) {
      map.set(row.paymentScheduleId, row._sum.amountCents ?? 0)
    }
    return map
  }

  /** True if the schedule ever had a verification, including cancelled ones. */
  async hasVerificationHistory(
    scheduleId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<boolean> {
    const client = tx ?? this.prisma
    const count = await client.financeVerification.count({
      where: { paymentScheduleId: scheduleId },
    })
    return count > 0
  }

  async batchHasVerificationHistory(scheduleIds: string[]): Promise<Map<string, boolean>> {
    const map = new Map<string, boolean>()
    for (const scheduleId of scheduleIds) {
      map.set(scheduleId, false)
    }
    if (scheduleIds.length === 0) {
      return map
    }

    const rows = await this.prisma.financeVerification.groupBy({
      by: ['paymentScheduleId'],
      where: { paymentScheduleId: { in: scheduleIds } },
      _count: { _all: true },
    })

    for (const row of rows) {
      map.set(row.paymentScheduleId, row._count._all > 0)
    }
    return map
  }

  async getAllocatedAmountCents(
    transactionId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const client = tx ?? this.prisma
    const result = await client.financeVerification.aggregate({
      where: {
        transactionId,
        status: PrismaVerificationStatus.normal,
      },
      _sum: { amountCents: true },
    })
    return result._sum.amountCents ?? 0
  }

  async batchGetAllocatedAmounts(transactionIds: string[]): Promise<Map<string, number>> {
    if (transactionIds.length === 0) {
      return new Map()
    }

    const rows = await this.prisma.financeVerification.groupBy({
      by: ['transactionId'],
      where: {
        transactionId: { in: transactionIds },
        status: PrismaVerificationStatus.normal,
      },
      _sum: { amountCents: true },
    })

    const map = new Map<string, number>()
    for (const row of rows) {
      map.set(row.transactionId, row._sum.amountCents ?? 0)
    }
    return map
  }

  /**
   * Unverified cash for departures: non-voided transactions explicitly linked to the
   * departure, summing unallocated amounts by inflow/outflow (ADR-0011 / #88).
   */
  async batchGetUnverifiedCashByDeparture(
    departureIds: string[],
  ): Promise<
    Map<string, { unverifiedIncomeCents: number; unverifiedExpenseCents: number }>
  > {
    const map = new Map<string, { unverifiedIncomeCents: number; unverifiedExpenseCents: number }>()
    for (const departureId of departureIds) {
      map.set(departureId, { unverifiedIncomeCents: 0, unverifiedExpenseCents: 0 })
    }
    if (departureIds.length === 0) {
      return map
    }

    const transactions = await this.prisma.financeTransaction.findMany({
      where: {
        departureId: { in: departureIds },
        voidedAt: null,
      },
      select: {
        id: true,
        departureId: true,
        direction: true,
        amountCents: true,
      },
    })
    if (transactions.length === 0) {
      return map
    }

    const allocatedByTransactionId = await this.batchGetAllocatedAmounts(
      transactions.map((transaction) => transaction.id),
    )

    for (const transaction of transactions) {
      if (!transaction.departureId) {
        continue
      }
      const unallocated = Math.max(
        transaction.amountCents - (allocatedByTransactionId.get(transaction.id) ?? 0),
        0,
      )
      if (unallocated <= 0) {
        continue
      }
      const bucket = map.get(transaction.departureId)
      if (!bucket) {
        continue
      }
      if (transaction.direction === PrismaTransactionDirection.inflow) {
        bucket.unverifiedIncomeCents += unallocated
      } else {
        bucket.unverifiedExpenseCents += unallocated
      }
    }

    return map
  }

  private buildListWhere(
    organizationId: string,
    query: ListFinanceVerificationsQueryDto,
  ): Prisma.FinanceVerificationWhereInput {
    const paymentScheduleFilter: Prisma.PaymentScheduleWhereInput = {}

    if (query.direction) {
      paymentScheduleFilter.direction = query.direction as PaymentScheduleDirection
    }
    if (query.scheduleNo) {
      paymentScheduleFilter.scheduleNo =
        query.scheduleNoMatch === 'exact'
          ? { equals: query.scheduleNo, mode: 'insensitive' }
          : { contains: query.scheduleNo, mode: 'insensitive' }
    }
    if (query.departureId) {
      paymentScheduleFilter.departureId = query.departureId
    }
    if (query.departureKeyword) {
      paymentScheduleFilter.departure = {
        OR: [
          { departureNo: { contains: query.departureKeyword, mode: 'insensitive' } },
          { name: { contains: query.departureKeyword, mode: 'insensitive' } },
        ],
      }
    }

    return {
      organizationId,
      ...(query.status
        ? {
            status:
              query.status === 'normal'
                ? PrismaVerificationStatus.normal
                : PrismaVerificationStatus.cancelled,
          }
        : {}),
      ...(query.verificationDateStart || query.verificationDateEnd
        ? {
            verificationDate: {
              ...(query.verificationDateStart
                ? { gte: parseDateOnly(query.verificationDateStart) }
                : {}),
              ...(query.verificationDateEnd
                ? { lte: parseDateOnly(query.verificationDateEnd) }
                : {}),
            },
          }
        : {}),
      ...(query.transactionNo
        ? {
            transaction: {
              transactionNo:
                query.transactionNoMatch === 'exact'
                  ? { equals: query.transactionNo, mode: 'insensitive' }
                  : { contains: query.transactionNo, mode: 'insensitive' },
            },
          }
        : {}),
      ...(Object.keys(paymentScheduleFilter).length > 0
        ? { paymentSchedule: paymentScheduleFilter }
        : {}),
    }
  }

  private async batchGetUserNames(userIds: string[]): Promise<Map<string, string>> {
    const uniqueIds = [...new Set(userIds)]
    if (uniqueIds.length === 0) {
      return new Map()
    }

    const users = await this.prisma.user.findMany({
      where: { id: { in: uniqueIds }, deletedAt: null },
      select: { id: true, name: true },
    })

    return new Map(users.map((user) => [user.id, user.name]))
  }

  private toListItem(
    verification: VerificationWithRelations,
    userNames: Map<string, string>,
  ): FinanceVerificationListItem {
    const summary = this.toSummary(verification)
    const schedule = verification.paymentSchedule
    const departure = schedule.departure

    return {
      ...summary,
      transactionNo: verification.transaction.transactionNo,
      scheduleNo: schedule.scheduleNo,
      direction: schedule.direction,
      departureId: schedule.departureId,
      departureNo: departure.departureNo,
      departureName: departure.name,
      counterpartyType: schedule.counterpartyType,
      counterpartyName: schedule.counterpartyName,
      createdByName: userNames.get(verification.createdBy) ?? '-',
      cancelledByName: verification.cancelledBy
        ? (userNames.get(verification.cancelledBy) ?? '-')
        : null,
    }
  }

  private async buildTransactionSummary(
    organizationId: string,
    transactionId: string,
  ): Promise<FinanceTransactionSummary> {
    const transaction = await this.prisma.financeTransaction.findFirst({
      where: { id: transactionId, organizationId },
      include: { departure: { select: { departureNo: true, name: true } } },
    })

    if (!transaction) {
      throw new NotFoundException('流水不存在')
    }

    const allocated = await this.getAllocatedAmountCents(transaction.id)
    return this.toTransactionSummary(transaction, allocated)
  }

  private async buildScheduleSummary(
    organizationId: string,
    scheduleId: string,
  ): Promise<PaymentScheduleSummary> {
    const schedule = await this.prisma.paymentSchedule.findFirst({
      where: { id: scheduleId, organizationId },
      include: { departure: { select: { status: true } } },
    })

    if (!schedule) {
      throw new NotFoundException('收付款节点不存在')
    }

    const settledAmountCents = await this.getSettledAmountCents(schedule.id)
    const hasVerificationHistory = await this.hasVerificationHistory(schedule.id)
    return this.toScheduleSummary(
      schedule,
      settledAmountCents,
      hasVerificationHistory,
      schedule.departure.status,
    )
  }

  private async assertScheduleAllocation(
    client: Prisma.TransactionClient | PrismaService,
    scheduleId: string,
    scheduleAmountCents: number,
    newAmountCents: number,
  ) {
    const settled = await this.getSettledAmountCents(scheduleId, client as Prisma.TransactionClient)
    if (settled + newAmountCents > scheduleAmountCents) {
      throw new BadRequestException('核销金额超出节点未结清余额')
    }
  }

  private async assertTransactionAllocation(
    client: Prisma.TransactionClient | PrismaService,
    transactionId: string,
    transactionAmountCents: number,
    newAmountCents: number,
  ) {
    const allocated = await this.getAllocatedAmountCents(
      transactionId,
      client as Prisma.TransactionClient,
    )
    if (allocated + newAmountCents > transactionAmountCents) {
      throw new BadRequestException('核销金额超出流水未分配余额')
    }
  }

  private assertPositiveAmount(amountCents: number) {
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      throw new BadRequestException('金额必须大于 0')
    }
  }

  private toSummary(verification: {
    id: string
    verificationNo: string
    paymentScheduleId: string
    transactionId: string
    amountCents: number
    verificationDate: Date
    remark: string | null
    createdBy: string
    cancelledBy: string | null
    cancelReason: string | null
    billUnsettledAfterCents: number
    status: PrismaVerificationStatus
    cancelledAt: Date | null
    createdAt: Date
    updatedAt: Date
  }): FinanceVerificationSummary {
    return {
      id: verification.id,
      verificationNo: verification.verificationNo,
      paymentScheduleId: verification.paymentScheduleId,
      transactionId: verification.transactionId,
      amountCents: verification.amountCents,
      verificationDate: formatDateOnly(verification.verificationDate),
      remark: verification.remark,
      createdBy: verification.createdBy,
      cancelledBy: verification.cancelledBy,
      cancelReason: verification.cancelReason,
      billUnsettledAfterCents: verification.billUnsettledAfterCents,
      status:
        verification.status === PrismaVerificationStatus.normal
          ? VerificationStatus.NORMAL
          : VerificationStatus.CANCELLED,
      cancelledAt: verification.cancelledAt?.toISOString() ?? null,
      createdAt: verification.createdAt.toISOString(),
      updatedAt: verification.updatedAt.toISOString(),
    }
  }

  private toTransactionSummary(
    transaction: FinanceTransaction & {
      departure?: { departureNo: string; name: string } | null
    },
    allocatedAmountCents: number,
  ): FinanceTransactionSummary {
    return {
      id: transaction.id,
      transactionNo: transaction.transactionNo,
      direction:
        transaction.direction === PrismaTransactionDirection.inflow
          ? TransactionDirection.INFLOW
          : TransactionDirection.OUTFLOW,
      paymentChannel: this.toPaymentChannel(transaction.paymentChannel),
      amountCents: transaction.amountCents,
      allocatedAmountCents,
      unallocatedAmountCents: transaction.amountCents - allocatedAmountCents,
      transactionDate: formatDateOnly(transaction.transactionDate),
      counterpartyType: transaction.counterpartyType,
      counterpartyId: transaction.counterpartyId,
      counterpartyName: transaction.counterpartyName,
      departureId: transaction.departureId,
      departureNo: transaction.departure?.departureNo ?? null,
      departureName: transaction.departure?.name ?? null,
      voidedAt: transaction.voidedAt?.toISOString() ?? null,
      voidReason: transaction.voidReason,
      notes: transaction.notes,
      createdAt: transaction.createdAt.toISOString(),
      updatedAt: transaction.updatedAt.toISOString(),
    }
  }

  private toScheduleSummary(
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
        direction: schedule.direction,
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

  private toPaymentChannel(value: PrismaPaymentChannel): PaymentChannel {
    switch (value) {
      case PrismaPaymentChannel.bank_transfer:
        return PaymentChannel.BANK_TRANSFER
      case PrismaPaymentChannel.wechat:
        return PaymentChannel.WECHAT
      case PrismaPaymentChannel.alipay:
        return PaymentChannel.ALIPAY
      case PrismaPaymentChannel.cash:
        return PaymentChannel.CASH
      case PrismaPaymentChannel.other:
        return PaymentChannel.OTHER
      default:
        return PaymentChannel.OTHER
    }
  }
}
