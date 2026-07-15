import { Body, Controller, Headers, Param, Post, Req, UseGuards } from '@nestjs/common'
import type { PaymentScheduleSummary } from '@xiaotuanbao/shared'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import {
  AdjustPaymentScheduleAmountDto,
  CancelPaymentScheduleDto,
  ReopenPaymentScheduleDto,
  VoidResourcePayableDto,
} from './dto/payment-schedule.dto'
import { PaymentScheduleService } from './payment-schedule.service'
import { FinanceIdempotencyService } from './finance-idempotency.service'

@Controller('finance/payment-schedules')
@UseGuards(JwtAuthGuard)
export class PaymentScheduleCancelController {
  constructor(
    private readonly paymentScheduleService: PaymentScheduleService,
    private readonly financeIdempotencyService: FinanceIdempotencyService,
  ) {}

  @Post(':id/cancel')
  cancel(
    @Req() request: { user: { organizationId: string; userId: string } },
    @Param('id') id: string,
    @Body() dto: CancelPaymentScheduleDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<PaymentScheduleSummary> {
    return this.financeIdempotencyService.execute({
      organizationId: request.user.organizationId,
      operation: 'close-payment-schedule',
      idempotencyKey,
      request: { scheduleId: id, dto, userId: request.user.userId },
      handler: (tx) =>
        this.paymentScheduleService.cancel(
          request.user.organizationId,
          id,
          request.user.userId,
          dto,
          tx,
        ),
    })
  }

  @Post(':id/reopen')
  reopen(
    @Req() request: { user: { organizationId: string; userId: string } },
    @Param('id') id: string,
    @Body() dto: ReopenPaymentScheduleDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<PaymentScheduleSummary> {
    return this.financeIdempotencyService.execute({
      organizationId: request.user.organizationId,
      operation: 'reopen-payment-schedule',
      idempotencyKey,
      request: { scheduleId: id, dto, userId: request.user.userId },
      handler: (tx) =>
        this.paymentScheduleService.reopen(
          request.user.organizationId,
          id,
          request.user.userId,
          dto,
          tx,
        ),
    })
  }

  @Post(':id/adjust-amount')
  adjustAmount(
    @Req() request: { user: { organizationId: string; userId: string } },
    @Param('id') id: string,
    @Body() dto: AdjustPaymentScheduleAmountDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<PaymentScheduleSummary> {
    return this.financeIdempotencyService.execute({
      organizationId: request.user.organizationId,
      operation: 'adjust-payment-schedule-amount',
      idempotencyKey,
      request: { scheduleId: id, dto, userId: request.user.userId },
      handler: (tx) =>
        this.paymentScheduleService.adjustAmount(
          request.user.organizationId,
          id,
          request.user.userId,
          dto,
          tx,
        ),
    })
  }

  @Post(':id/void-resource-payable')
  voidResourcePayable(
    @Req() request: { user: { organizationId: string; userId: string } },
    @Param('id') id: string,
    @Body() dto: VoidResourcePayableDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<PaymentScheduleSummary> {
    return this.financeIdempotencyService.execute({
      organizationId: request.user.organizationId,
      operation: 'void-resource-payable',
      idempotencyKey,
      request: { scheduleId: id, dto, userId: request.user.userId },
      handler: (tx) =>
        this.paymentScheduleService.voidResourcePayable(
          request.user.organizationId,
          id,
          request.user.userId,
          dto,
          tx,
        ),
    })
  }
}
