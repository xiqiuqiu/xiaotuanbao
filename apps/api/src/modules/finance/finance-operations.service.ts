import { BadRequestException, Inject, Injectable, NotFoundException, forwardRef } from '@nestjs/common'
import type { PaymentScheduleSummary } from '@xiaotuanbao/shared'
import {
  assertCounterpartyMatch,
  CounterpartyMismatchError,
} from '@xiaotuanbao/shared'
import {
  PaymentScheduleDirection,
  Prisma,
  TransactionDirection as PrismaTransactionDirection,
  type PaymentSchedule,
} from '@prisma/client'
import { formatDateOnly } from '../departure/departure-date.utils'
import { DepartureFinanceBridgeService } from '../departure/departure-finance-bridge.service'
import { PrismaService } from '../../database/prisma/prisma.service'
import type {
  ConfirmCollectionDto,
  ConfirmPaymentDto,
  LinkTransactionDto,
} from './dto/finance-operations.dto'
import type { DepartureFinanceFacade } from './departure-finance-facade.service'
import { PaymentScheduleService } from './payment-schedule.service'

function departureFinanceFacadeService() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('./departure-finance-facade.service')
    .DepartureFinanceFacade as typeof import('./departure-finance-facade.service').DepartureFinanceFacade
}
import { TransactionService } from './transaction.service'
import { VerificationService } from './verification.service'
import { FinanceIdempotencyService } from './finance-idempotency.service'

@Injectable()
export class FinanceOperationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentScheduleService: PaymentScheduleService,
    private readonly transactionService: TransactionService,
    private readonly verificationService: VerificationService,
    @Inject(forwardRef(departureFinanceFacadeService))
    private readonly departureFinanceFacade: DepartureFinanceFacade,
    private readonly financeIdempotencyService: FinanceIdempotencyService,
    @Inject(forwardRef(() => DepartureFinanceBridgeService))
    private readonly departureFinanceBridge: DepartureFinanceBridgeService,
  ) {}

  async confirmCollection(
    organizationId: string,
    scheduleId: string,
    dto: ConfirmCollectionDto,
    userId: string,
    idempotencyKey?: string,
  ): Promise<PaymentScheduleSummary> {
    return this.confirmSchedule(
      organizationId,
      PaymentScheduleDirection.receivable,
      scheduleId,
      dto,
      userId,
      idempotencyKey,
    )
  }

  async confirmPayment(
    organizationId: string,
    scheduleId: string,
    dto: ConfirmPaymentDto,
    userId: string,
    idempotencyKey?: string,
  ): Promise<PaymentScheduleSummary> {
    return this.confirmSchedule(
      organizationId,
      PaymentScheduleDirection.payable,
      scheduleId,
      dto,
      userId,
      idempotencyKey,
    )
  }

  async linkTransaction(
    organizationId: string,
    direction: PaymentScheduleDirection,
    scheduleId: string,
    dto: LinkTransactionDto,
    userId: string,
    idempotencyKey?: string,
  ): Promise<PaymentScheduleSummary> {
    const result = await this.financeIdempotencyService.execute({
      organizationId,
      operation: `link-transaction-${direction}`,
      idempotencyKey,
      request: { scheduleId, dto, userId },
      handler: async (tx) => {
        const schedule = await this.findScheduleOrThrow(
          organizationId,
          scheduleId,
          direction,
          tx,
        )
        await this.departureFinanceFacade.lockMutableById(
          tx,
          organizationId,
          schedule.departureId,
          '关联流水',
        )
        this.assertScheduleOpen(schedule)
        this.assertPositiveAmount(dto.amountCents)

        const transaction = await tx.financeTransaction.findFirst({
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
          tx,
        )

        return { scheduleId: schedule.id }
      },
    })

    const generatedRebatePayable =
      await this.departureFinanceBridge.syncActualCollectionSettlementAfterGuestVerification(
        organizationId,
        result.scheduleId,
      )

    const scheduleSummary = await this.paymentScheduleService.getById(
      organizationId,
      direction,
      result.scheduleId,
    )
    return { ...scheduleSummary, generatedRebatePayable }
  }

  private async confirmSchedule(
    organizationId: string,
    direction: PaymentScheduleDirection,
    scheduleId: string,
    dto: ConfirmCollectionDto | ConfirmPaymentDto,
    userId: string,
    idempotencyKey?: string,
  ): Promise<PaymentScheduleSummary> {
    const receivable = direction === PaymentScheduleDirection.receivable
    const result = await this.financeIdempotencyService.execute({
      organizationId,
      operation: receivable ? 'confirm-collection' : 'confirm-payment',
      idempotencyKey,
      request: { scheduleId, dto, userId },
      handler: async (tx) => {
        const schedule = await this.findScheduleOrThrow(
          organizationId,
          scheduleId,
          direction,
          tx,
        )
        await this.departureFinanceFacade.lockMutableById(
          tx,
          organizationId,
          schedule.departureId,
          receivable ? '确认收款' : '确认付款',
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

        const transaction = await this.transactionService.create(
          organizationId,
          {
            direction: receivable
              ? PrismaTransactionDirection.inflow
              : PrismaTransactionDirection.outflow,
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

        return { scheduleId: schedule.id }
      },
    })

    const generatedRebatePayable =
      await this.departureFinanceBridge.syncActualCollectionSettlementAfterGuestVerification(
        organizationId,
        result.scheduleId,
      )

    const scheduleSummary = await this.paymentScheduleService.getById(
      organizationId,
      direction,
      result.scheduleId,
    )
    return { ...scheduleSummary, generatedRebatePayable }
  }

  private async findScheduleOrThrow(
    organizationId: string,
    scheduleId: string,
    direction: PaymentScheduleDirection,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<PaymentSchedule> {
    const schedule = await client.paymentSchedule.findFirst({
      where: { id: scheduleId, organizationId, direction },
    })

    if (!schedule) {
      throw new NotFoundException('收付款节点不存在')
    }

    return schedule
  }

  private assertScheduleOpen(schedule: PaymentSchedule) {
    if (schedule.voidedAt) {
      throw new BadRequestException('已作废节点不可核销')
    }
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
