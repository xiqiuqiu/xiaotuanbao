import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import type {
  FinanceVerificationListResult,
  FinanceVerificationSummary,
} from '@xiaotuanbao/shared'
import { VerificationStatus } from '@xiaotuanbao/shared'
import { VerificationStatus as PrismaVerificationStatus, type Prisma } from '@prisma/client'
import { PrismaService } from '../../database/prisma/prisma.service'
import { NumberAllocationService } from '../number-allocation/number-allocation.service'
import type {
  CreateFinanceVerificationDto,
  ListFinanceVerificationsQueryDto,
} from './dto/verification.dto'

@Injectable()
export class VerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numberAllocationService: NumberAllocationService,
  ) {}

  async list(
    organizationId: string,
    query: ListFinanceVerificationsQueryDto,
  ): Promise<FinanceVerificationListResult> {
    const page = Math.max(Number(query.page) || 1, 1)
    const pageSize = Math.min(Math.max(Number(query.pageSize) || 10, 1), 100)

    const where: Prisma.FinanceVerificationWhereInput = {
      organizationId,
      ...(query.paymentScheduleId ? { paymentScheduleId: query.paymentScheduleId } : {}),
      ...(query.transactionId ? { transactionId: query.transactionId } : {}),
      ...(query.departureId
        ? { paymentSchedule: { departureId: query.departureId } }
        : {}),
    }

    const [items, total] = await Promise.all([
      this.prisma.financeVerification.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.financeVerification.count({ where }),
    ])

    return {
      items: items.map((item) => this.toSummary(item)),
      total,
      page,
      pageSize,
    }
  }

  async getById(organizationId: string, verificationId: string): Promise<FinanceVerificationSummary> {
    const verification = await this.prisma.financeVerification.findFirst({
      where: { id: verificationId, organizationId },
    })

    if (!verification) {
      throw new NotFoundException('核销记录不存在')
    }

    return this.toSummary(verification)
  }

  async create(
    organizationId: string,
    dto: CreateFinanceVerificationDto,
    tx?: Prisma.TransactionClient,
  ): Promise<FinanceVerificationSummary> {
    const client = tx ?? this.prisma
    this.assertPositiveAmount(dto.amountCents)

    const schedule = await client.paymentSchedule.findFirst({
      where: { id: dto.paymentScheduleId, organizationId },
    })
    if (!schedule) {
      throw new NotFoundException('收付款节点不存在')
    }
    if (schedule.cancelledAt) {
      throw new BadRequestException('已关闭节点不可核销')
    }

    const transaction = await client.financeTransaction.findFirst({
      where: { id: dto.transactionId, organizationId },
    })
    if (!transaction) {
      throw new NotFoundException('流水不存在')
    }
    if (transaction.voidedAt) {
      throw new BadRequestException('流水已作废，不可关联')
    }

    await this.assertScheduleAllocation(client, schedule.id, schedule.amountCents, dto.amountCents)
    await this.assertTransactionAllocation(
      client,
      transaction.id,
      transaction.amountCents,
      dto.amountCents,
    )

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
        status: PrismaVerificationStatus.normal,
      },
    })

    return this.toSummary(verification)
  }

  async cancel(organizationId: string, verificationId: string): Promise<FinanceVerificationSummary> {
    const verification = await this.prisma.financeVerification.findFirst({
      where: { id: verificationId, organizationId },
    })

    if (!verification) {
      throw new NotFoundException('核销记录不存在')
    }

    if (verification.status === PrismaVerificationStatus.cancelled) {
      throw new BadRequestException('核销已撤销')
    }

    const updated = await this.prisma.financeVerification.update({
      where: { id: verification.id },
      data: {
        status: PrismaVerificationStatus.cancelled,
        cancelledAt: new Date(),
      },
    })

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
      status:
        verification.status === PrismaVerificationStatus.normal
          ? VerificationStatus.NORMAL
          : VerificationStatus.CANCELLED,
      cancelledAt: verification.cancelledAt?.toISOString() ?? null,
      createdAt: verification.createdAt.toISOString(),
      updatedAt: verification.updatedAt.toISOString(),
    }
  }
}
