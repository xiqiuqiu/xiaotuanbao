import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import type { PaymentScheduleSummary } from '@xiaotuanbao/shared'
import {
  assertCounterpartyMatch,
  CounterpartyMismatchError,
} from '@xiaotuanbao/shared'
import {
  PaymentScheduleDirection,
  TransactionDirection as PrismaTransactionDirection,
  type PaymentSchedule,
} from '@prisma/client'
import { formatDateOnly } from '../departure/departure-date.utils'
import { PrismaService } from '../../database/prisma/prisma.service'
import type {
  ConfirmCollectionDto,
  ConfirmPaymentDto,
  LinkTransactionDto,
} from './dto/finance-operations.dto'
import { DepartureFinanceFacade } from './departure-finance-facade.service'
import { PaymentScheduleService } from './payment-schedule.service'
import { TransactionService } from './transaction.service'
import { VerificationService } from './verification.service'

@Injectable()
export class FinanceOperationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentScheduleService: PaymentScheduleService,
    private readonly transactionService: TransactionService,
    private readonly verificationService: VerificationService,
    private readonly departureFinanceFacade: DepartureFinanceFacade,
  ) {}

  async confirmCollection(
    organizationId: string,
    scheduleId: string,
    dto: ConfirmCollectionDto,
    userId: string,
  ): Promise<PaymentScheduleSummary> {
    const schedule = await this.findScheduleOrThrow(
      organizationId,
      scheduleId,
      PaymentScheduleDirection.receivable,
    )
    await this.departureFinanceFacade.assertMutableById(
      organizationId,
      schedule.departureId,
      '确认收款',
    )
    this.assertScheduleOpen(schedule)
    this.assertPositiveAmount(dto.amountCents)

    const counterparty = this.resolveCounterparty(schedule, dto)

    try {
      assertCounterpartyMatch(schedule, counterparty)
    } catch (error) {
      if (error instanceof CounterpartyMismatchError) {
        throw new BadRequestException(error.message)
      }
      throw error
    }

    await this.prisma.$transaction(async (tx) => {
      const transaction = await this.transactionService.create(
        organizationId,
        {
          direction: PrismaTransactionDirection.inflow,
          paymentChannel: dto.paymentChannel,
          amountCents: dto.amountCents,
          transactionDate: dto.transactionDate,
          counterpartyType: counterparty.counterpartyType,
          counterpartyId: counterparty.counterpartyId ?? undefined,
          counterpartyName: counterparty.counterpartyName ?? undefined,
          departureId: schedule.departureId,
          notes: dto.notes,
        },
        tx,
      )

      await this.verificationService.create(
        organizationId,
        {
          paymentScheduleId: schedule.id,
          transactionId: transaction.id,
          amountCents: dto.amountCents,
          verificationDate: dto.transactionDate,
          remark: dto.notes,
        },
        { createdBy: userId },
        tx,
      )
    })

    return this.paymentScheduleService.getById(
      organizationId,
      PaymentScheduleDirection.receivable,
      scheduleId,
    )
  }

  async confirmPayment(
    organizationId: string,
    scheduleId: string,
    dto: ConfirmPaymentDto,
    userId: string,
  ): Promise<PaymentScheduleSummary> {
    const schedule = await this.findScheduleOrThrow(
      organizationId,
      scheduleId,
      PaymentScheduleDirection.payable,
    )
    await this.departureFinanceFacade.assertMutableById(
      organizationId,
      schedule.departureId,
      '确认付款',
    )
    this.assertScheduleOpen(schedule)
    this.assertPositiveAmount(dto.amountCents)

    const counterparty = this.resolveCounterparty(schedule, dto)

    try {
      assertCounterpartyMatch(schedule, counterparty)
    } catch (error) {
      if (error instanceof CounterpartyMismatchError) {
        throw new BadRequestException(error.message)
      }
      throw error
    }

    await this.prisma.$transaction(async (tx) => {
      const transaction = await this.transactionService.create(
        organizationId,
        {
          direction: PrismaTransactionDirection.outflow,
          paymentChannel: dto.paymentChannel,
          amountCents: dto.amountCents,
          transactionDate: dto.transactionDate,
          counterpartyType: counterparty.counterpartyType,
          counterpartyId: counterparty.counterpartyId ?? undefined,
          counterpartyName: counterparty.counterpartyName ?? undefined,
          departureId: schedule.departureId,
          notes: dto.notes,
        },
        tx,
      )

      await this.verificationService.create(
        organizationId,
        {
          paymentScheduleId: schedule.id,
          transactionId: transaction.id,
          amountCents: dto.amountCents,
          verificationDate: dto.transactionDate,
          remark: dto.notes,
        },
        { createdBy: userId },
        tx,
      )
    })

    return this.paymentScheduleService.getById(
      organizationId,
      PaymentScheduleDirection.payable,
      scheduleId,
    )
  }

  async linkTransaction(
    organizationId: string,
    direction: PaymentScheduleDirection,
    scheduleId: string,
    dto: LinkTransactionDto,
    userId: string,
  ): Promise<PaymentScheduleSummary> {
    const schedule = await this.findScheduleOrThrow(organizationId, scheduleId, direction)
    await this.departureFinanceFacade.assertMutableById(
      organizationId,
      schedule.departureId,
      '关联流水',
    )
    this.assertScheduleOpen(schedule)
    this.assertPositiveAmount(dto.amountCents)

    const transaction = await this.prisma.financeTransaction.findFirst({
      where: { id: dto.transactionId, organizationId },
    })

    if (!transaction) {
      throw new NotFoundException('流水不存在')
    }

    if (transaction.voidedAt) {
      throw new BadRequestException('流水已作废，不可关联')
    }

    await this.verificationService.create(
      organizationId,
      {
        paymentScheduleId: schedule.id,
        transactionId: transaction.id,
        amountCents: dto.amountCents,
        verificationDate: formatDateOnly(transaction.transactionDate),
      },
      { createdBy: userId },
    )

    return this.paymentScheduleService.getById(organizationId, direction, scheduleId)
  }

  private async findScheduleOrThrow(
    organizationId: string,
    scheduleId: string,
    direction: PaymentScheduleDirection,
  ): Promise<PaymentSchedule> {
    const schedule = await this.prisma.paymentSchedule.findFirst({
      where: { id: scheduleId, organizationId, direction },
    })

    if (!schedule) {
      throw new NotFoundException('收付款节点不存在')
    }

    return schedule
  }

  private assertScheduleOpen(schedule: PaymentSchedule) {
    if (schedule.cancelledAt) {
      throw new BadRequestException('已关闭节点不可核销')
    }
  }

  private assertPositiveAmount(amountCents: number) {
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      throw new BadRequestException('金额必须大于 0')
    }
  }

  private resolveCounterparty(
    schedule: PaymentSchedule,
    dto: ConfirmCollectionDto | ConfirmPaymentDto,
  ) {
    return {
      counterpartyType: dto.counterpartyType ?? schedule.counterpartyType,
      counterpartyId: dto.counterpartyId?.trim() ?? schedule.counterpartyId,
      counterpartyName: dto.counterpartyName?.trim() ?? schedule.counterpartyName,
    }
  }
}
