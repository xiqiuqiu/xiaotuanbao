import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import type {
  FinanceTransactionListResult,
  FinanceTransactionSummary,
} from '@xiaotuanbao/shared'
import { deriveTransactionWriteoffStatus, TransactionDirection, PaymentChannel } from '@xiaotuanbao/shared'
import {
  CounterpartyType as PrismaCounterpartyType,
  PaymentChannel as PrismaPaymentChannel,
  TransactionDirection as PrismaTransactionDirection,
  type FinanceTransaction,
  type Prisma,
} from '@prisma/client'
import { PrismaService } from '../../database/prisma/prisma.service'
import { NumberAllocationService } from '../number-allocation/number-allocation.service'
import {
  formatDateOnly,
  parseDateOnly,
} from '../departure/departure-date.utils'
import type {
  CreateFinanceTransactionDto,
  ListFinanceTransactionsQueryDto,
  UpdateFinanceTransactionDto,
  VoidFinanceTransactionDto,
} from './dto/transaction.dto'
import { VerificationService } from './verification.service'

@Injectable()
export class TransactionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly verificationService: VerificationService,
    private readonly numberAllocationService: NumberAllocationService,
  ) {}

  async list(
    organizationId: string,
    query: ListFinanceTransactionsQueryDto,
  ): Promise<FinanceTransactionListResult> {
    const page = Math.max(Number(query.page) || 1, 1)
    const pageSize = Math.min(Math.max(Number(query.pageSize) || 10, 1), 100)

    const where = this.buildListWhere(organizationId, query)

    if (query.writeoffStatus) {
      const candidates = await this.prisma.financeTransaction.findMany({
        where,
        select: { id: true, amountCents: true },
      })
      const allocatedMap = await this.verificationService.batchGetAllocatedAmounts(
        candidates.map((item) => item.id),
      )
      const filteredIds = candidates
        .filter((item) => {
          const allocated = allocatedMap.get(item.id) ?? 0
          return (
            deriveTransactionWriteoffStatus(item.amountCents, allocated).status ===
            query.writeoffStatus
          )
        })
        .map((item) => item.id)
      where.id = { in: filteredIds }
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

    const counterparty = await this.resolveCounterparty(organizationId, dto, client)

    const transactionNo = await this.numberAllocationService.allocateTransactionNo(
      organizationId,
      client,
    )

    const transaction = await client.financeTransaction.create({
      data: {
        organizationId,
        transactionNo,
        direction: dto.direction,
        paymentChannel: dto.paymentChannel,
        amountCents: dto.amountCents,
        transactionDate: parseDateOnly(dto.transactionDate),
        counterpartyType: counterparty.counterpartyType,
        counterpartyId: counterparty.counterpartyId,
        counterpartyName: counterparty.counterpartyName,
        departureId: dto.departureId ?? null,
        notes: dto.notes?.trim() || null,
      },
    })

    return this.toSummary(transaction, 0)
  }

  async update(
    organizationId: string,
    transactionId: string,
    dto: UpdateFinanceTransactionDto,
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
      throw new BadRequestException('流水已有核销分配，不可编辑')
    }

    this.assertPositiveAmount(dto.amountCents)

    if (dto.departureId) {
      await this.ensureDepartureExists(organizationId, dto.departureId)
    }

    const counterparty = await this.resolveCounterparty(organizationId, dto)

    const updated = await this.prisma.financeTransaction.update({
      where: { id: transaction.id },
      data: {
        direction: dto.direction,
        paymentChannel: dto.paymentChannel,
        amountCents: dto.amountCents,
        transactionDate: parseDateOnly(dto.transactionDate),
        counterpartyType: counterparty.counterpartyType,
        counterpartyId: counterparty.counterpartyId,
        counterpartyName: counterparty.counterpartyName,
        departureId: dto.departureId ?? null,
        notes: dto.notes?.trim() || null,
      },
    })

    return this.toSummary(updated, allocated)
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

    const voidReason = dto.voidReason?.trim()
    if (!voidReason) {
      throw new BadRequestException('作废原因不能为空')
    }

    const updated = await this.prisma.financeTransaction.update({
      where: { id: transaction.id },
      data: {
        voidedAt: new Date(),
        voidReason,
      },
    })

    return this.toSummary(updated, 0)
  }

  private buildListWhere(
    organizationId: string,
    query: ListFinanceTransactionsQueryDto,
  ): Prisma.FinanceTransactionWhereInput {
    const where: Prisma.FinanceTransactionWhereInput = { organizationId }

    if (query.departureId) {
      where.departureId = query.departureId
    }

    if (query.direction) {
      where.direction = query.direction
    }

    if (query.dateStart || query.dateEnd) {
      where.transactionDate = {}
      if (query.dateStart) {
        where.transactionDate.gte = parseDateOnly(query.dateStart)
      }
      if (query.dateEnd) {
        where.transactionDate.lte = parseDateOnly(query.dateEnd)
      }
    }

    if (query.transactionNo?.trim()) {
      where.transactionNo = { contains: query.transactionNo.trim() }
    }

    if (query.partnerKeyword?.trim()) {
      where.counterpartyName = { contains: query.partnerKeyword.trim() }
    }

    if (query.status === 'normal') {
      where.voidedAt = null
    } else if (query.status === 'voided') {
      where.voidedAt = { not: null }
    }

    return where
  }

  private toPaymentChannel(channel: PrismaPaymentChannel): PaymentChannel {
    switch (channel) {
      case PrismaPaymentChannel.cash:
        return PaymentChannel.CASH
      case PrismaPaymentChannel.bank_transfer:
        return PaymentChannel.BANK_TRANSFER
      case PrismaPaymentChannel.wechat:
        return PaymentChannel.WECHAT
      case PrismaPaymentChannel.alipay:
        return PaymentChannel.ALIPAY
      case PrismaPaymentChannel.other:
        return PaymentChannel.OTHER
    }
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

  private async resolveCounterparty(
    organizationId: string,
    dto: CreateFinanceTransactionDto | UpdateFinanceTransactionDto,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<{
    counterpartyType: PrismaCounterpartyType
    counterpartyId: string | null
    counterpartyName: string | null
  }> {
    if (
      dto.counterpartyType === PrismaCounterpartyType.partner ||
      dto.counterpartyType === PrismaCounterpartyType.supplier
    ) {
      const counterpartyId = dto.counterpartyId?.trim()
      if (!counterpartyId) {
        throw new BadRequestException('请选择往来对象档案')
      }

      if (dto.counterpartyType === PrismaCounterpartyType.partner) {
        const partner = await client.partner.findFirst({
          where: { id: counterpartyId, organizationId },
        })
        if (!partner) {
          throw new NotFoundException('合作伙伴不存在')
        }
        return {
          counterpartyType: dto.counterpartyType,
          counterpartyId: partner.id,
          counterpartyName: partner.name,
        }
      }

      const supplier = await client.supplier.findFirst({
        where: { id: counterpartyId, organizationId },
      })
      if (!supplier) {
        throw new NotFoundException('供应商不存在')
      }
      return {
        counterpartyType: dto.counterpartyType,
        counterpartyId: supplier.id,
        counterpartyName: supplier.name,
      }
    }

    return {
      counterpartyType: dto.counterpartyType,
      counterpartyId: null,
      counterpartyName: dto.counterpartyName?.trim() || null,
    }
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
      paymentChannel: this.toPaymentChannel(transaction.paymentChannel),
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
