import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import type {
  FinanceTransactionListResult,
  FinanceTransactionSummary,
} from '@xiaotuanbao/shared'
import { generateTransactionNo, TransactionDirection } from '@xiaotuanbao/shared'
import {
  TransactionDirection as PrismaTransactionDirection,
  type FinanceTransaction,
  type Prisma,
} from '@prisma/client'
import { PrismaService } from '../../database/prisma/prisma.service'
import {
  formatDateOnly,
  getShanghaiTodayString,
  parseDateOnly,
} from '../departure/departure-date.utils'
import type {
  CreateFinanceTransactionDto,
  ListFinanceTransactionsQueryDto,
  VoidFinanceTransactionDto,
} from './dto/transaction.dto'
import { VerificationService } from './verification.service'

@Injectable()
export class TransactionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly verificationService: VerificationService,
  ) {}

  async list(
    organizationId: string,
    query: ListFinanceTransactionsQueryDto,
  ): Promise<FinanceTransactionListResult> {
    const page = Math.max(Number(query.page) || 1, 1)
    const pageSize = Math.min(Math.max(Number(query.pageSize) || 10, 1), 100)

    const where: Prisma.FinanceTransactionWhereInput = {
      organizationId,
      ...(query.departureId ? { departureId: query.departureId } : {}),
    }

    const [items, total] = await Promise.all([
      this.prisma.financeTransaction.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.financeTransaction.count({ where }),
    ])

    const allocatedMap = await this.verificationService.batchGetAllocatedAmounts(
      items.map((item) => item.id),
    )

    return {
      items: items.map((item) =>
        this.toSummary(item, allocatedMap.get(item.id) ?? 0),
      ),
      total,
      page,
      pageSize,
    }
  }

  async getById(organizationId: string, transactionId: string): Promise<FinanceTransactionSummary> {
    const transaction = await this.prisma.financeTransaction.findFirst({
      where: { id: transactionId, organizationId },
    })

    if (!transaction) {
      throw new NotFoundException('流水不存在')
    }

    const allocated = await this.verificationService.getAllocatedAmountCents(transaction.id)
    return this.toSummary(transaction, allocated)
  }

  async create(
    organizationId: string,
    dto: CreateFinanceTransactionDto,
    tx?: Prisma.TransactionClient,
  ): Promise<FinanceTransactionSummary> {
    const client = tx ?? this.prisma
    this.assertPositiveAmount(dto.amountCents)

    if (dto.departureId) {
      await this.ensureDepartureExists(organizationId, dto.departureId, client)
    }

    const businessDate = getShanghaiTodayString()
    const transactionNo = await this.allocateTransactionNo(organizationId, businessDate, client)

    const transaction = await client.financeTransaction.create({
      data: {
        organizationId,
        transactionNo,
        direction: dto.direction,
        amountCents: dto.amountCents,
        transactionDate: parseDateOnly(dto.transactionDate),
        counterpartyType: dto.counterpartyType,
        counterpartyId: dto.counterpartyId?.trim() || null,
        counterpartyName: dto.counterpartyName?.trim() || null,
        departureId: dto.departureId ?? null,
        notes: dto.notes?.trim() || null,
      },
    })

    return this.toSummary(transaction, 0)
  }

  async void(
    organizationId: string,
    transactionId: string,
    dto: VoidFinanceTransactionDto,
  ): Promise<FinanceTransactionSummary> {
    const transaction = await this.prisma.financeTransaction.findFirst({
      where: { id: transactionId, organizationId },
    })

    if (!transaction) {
      throw new NotFoundException('流水不存在')
    }

    if (transaction.voidedAt) {
      throw new BadRequestException('流水已作废')
    }

    const allocated = await this.verificationService.getAllocatedAmountCents(transaction.id)
    if (allocated > 0) {
      throw new BadRequestException('流水已有核销分配，不可作废')
    }

    const updated = await this.prisma.financeTransaction.update({
      where: { id: transaction.id },
      data: {
        voidedAt: new Date(),
        voidReason: dto.voidReason?.trim() || null,
      },
    })

    return this.toSummary(updated, 0)
  }

  private assertPositiveAmount(amountCents: number) {
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      throw new BadRequestException('金额必须大于 0')
    }
  }

  private async ensureDepartureExists(
    organizationId: string,
    departureId: string,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const departure = await client.departure.findFirst({
      where: { id: departureId, organizationId },
    })

    if (!departure) {
      throw new NotFoundException('发团不存在')
    }
  }

  private async allocateTransactionNo(
    organizationId: string,
    businessDate: string,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<string> {
    const datePart = businessDate.replace(/-/g, '')
    const prefix = `TR${datePart}`

    const latest = await client.financeTransaction.findFirst({
      where: {
        organizationId,
        transactionNo: { startsWith: prefix },
      },
      orderBy: { transactionNo: 'desc' },
      select: { transactionNo: true },
    })

    const lastSequence = latest ? Number(latest.transactionNo.slice(-4)) : 0
    return generateTransactionNo(businessDate, lastSequence + 1)
  }

  private toSummary(
    transaction: FinanceTransaction,
    allocatedAmountCents: number,
  ): FinanceTransactionSummary {
    return {
      id: transaction.id,
      transactionNo: transaction.transactionNo,
      direction:
        transaction.direction === PrismaTransactionDirection.inflow
          ? TransactionDirection.INFLOW
          : TransactionDirection.OUTFLOW,
      amountCents: transaction.amountCents,
      allocatedAmountCents,
      unallocatedAmountCents: transaction.amountCents - allocatedAmountCents,
      transactionDate: formatDateOnly(transaction.transactionDate),
      counterpartyType: transaction.counterpartyType,
      counterpartyId: transaction.counterpartyId,
      counterpartyName: transaction.counterpartyName,
      departureId: transaction.departureId,
      voidedAt: transaction.voidedAt?.toISOString() ?? null,
      voidReason: transaction.voidReason,
      notes: transaction.notes,
      createdAt: transaction.createdAt.toISOString(),
      updatedAt: transaction.updatedAt.toISOString(),
    }
  }
}
