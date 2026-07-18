import { Body, Controller, Headers, Param, Post, Req, UseGuards } from '@nestjs/common'
import type { PaymentScheduleSummary } from '@xiaotuanbao/shared'
import { RequireMenu } from '../../common/decorators/require-menu.decorator'
import { MenuPermissionGuard } from '../../common/guards/menu-permission.guard'
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
@UseGuards(JwtAuthGuard, MenuPermissionGuard)
export class PaymentScheduleCancelController {
  constructor(
    private readonly paymentScheduleService: PaymentScheduleService,
    private readonly financeIdempotencyService: FinanceIdempotencyService,
  ) {}

  // ADR-0023: 关闭节点/调整约定金额/重新打开都是财务动作，收回 ADR-0016 后计调
  // 不持有任何 /finance/* menuKey，故一律被拒（403）。财务持有全部四个 finance
  // menuKey，用 /finance/receivable 与前端 canMutateFinance 口径保持一致。
  @Post(':id/cancel')
  @RequireMenu('/finance/receivable')
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
  @RequireMenu('/finance/receivable')
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
  @RequireMenu('/finance/receivable')
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

  // ADR-0023: 资源应付作废是计调纠错动作（与「关闭节点」＝财务互补），归 departure:write，
  // 财务无此 action key 故被拒（403），计调与企业管理员可作废。
  @Post(':id/void-resource-payable')
  @RequireMenu('departure:write')
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
