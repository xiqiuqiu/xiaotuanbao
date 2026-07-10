import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common'
import type { PaymentScheduleSummary } from '@xiaotuanbao/shared'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import {
  AdjustPaymentScheduleAmountDto,
  CancelPaymentScheduleDto,
  ReopenPaymentScheduleDto,
} from './dto/payment-schedule.dto'
import { PaymentScheduleService } from './payment-schedule.service'

@Controller('finance/payment-schedules')
@UseGuards(JwtAuthGuard)
export class PaymentScheduleCancelController {
  constructor(private readonly paymentScheduleService: PaymentScheduleService) {}

  @Post(':id/cancel')
  cancel(
    @Req() request: { user: { organizationId: string; userId: string } },
    @Param('id') id: string,
    @Body() dto: CancelPaymentScheduleDto,
  ): Promise<PaymentScheduleSummary> {
    return this.paymentScheduleService.cancel(
      request.user.organizationId,
      id,
      request.user.userId,
      dto,
    )
  }

  @Post(':id/reopen')
  reopen(
    @Req() request: { user: { organizationId: string; userId: string } },
    @Param('id') id: string,
    @Body() dto: ReopenPaymentScheduleDto,
  ): Promise<PaymentScheduleSummary> {
    return this.paymentScheduleService.reopen(
      request.user.organizationId,
      id,
      request.user.userId,
      dto,
    )
  }

  @Post(':id/adjust-amount')
  adjustAmount(
    @Req() request: { user: { organizationId: string; userId: string } },
    @Param('id') id: string,
    @Body() dto: AdjustPaymentScheduleAmountDto,
  ): Promise<PaymentScheduleSummary> {
    return this.paymentScheduleService.adjustAmount(
      request.user.organizationId,
      id,
      request.user.userId,
      dto,
    )
  }
}
