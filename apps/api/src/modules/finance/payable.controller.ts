import { Body, Controller, Get, Headers, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common'
import type { PaymentScheduleDetail, PaymentScheduleListResult, PaymentScheduleSummary } from '@xiaotuanbao/shared'
import { PaymentScheduleDirection } from '@prisma/client'
import { RequireMenu } from '../../common/decorators/require-menu.decorator'
import { MenuPermissionGuard } from '../../common/guards/menu-permission.guard'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import {
  CreatePaymentScheduleDto,
  ListPaymentSchedulesQueryDto,
  UpdatePaymentScheduleDto,
} from './dto/payment-schedule.dto'
import { PaymentScheduleService } from './payment-schedule.service'
import { FinanceOperationsService } from './finance-operations.service'
import { ConfirmPaymentDto, LinkTransactionDto } from './dto/finance-operations.dto'
import { FinanceIdempotencyService } from './finance-idempotency.service'

@Controller('finance/payables')
@UseGuards(JwtAuthGuard, MenuPermissionGuard)
export class PayableController {
  constructor(
    private readonly paymentScheduleService: PaymentScheduleService,
    private readonly financeOperationsService: FinanceOperationsService,
    private readonly financeIdempotencyService: FinanceIdempotencyService,
  ) {}

  @Get()
  @RequireMenu('/finance/payable')
  list(
    @Req() request: { user: { organizationId: string } },
    @Query() query: ListPaymentSchedulesQueryDto,
  ): Promise<PaymentScheduleListResult> {
    return this.paymentScheduleService.list(
      request.user.organizationId,
      PaymentScheduleDirection.payable,
      query,
    )
  }

  @Post()
  @RequireMenu('/finance/payable')
  create(
    @Req() request: { user: { organizationId: string; userId: string } },
    @Body() dto: CreatePaymentScheduleDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<PaymentScheduleSummary> {
    return this.financeIdempotencyService.execute({
      organizationId: request.user.organizationId,
      operation: 'create-payable',
      idempotencyKey,
      request: { dto, userId: request.user.userId },
      handler: (tx) =>
        this.paymentScheduleService.create(
          request.user.organizationId,
          PaymentScheduleDirection.payable,
          dto,
          tx,
        ),
    })
  }

  // ADR-0024：见 ReceivableController.getById——收付款节点详情读按 /departure 放行，
  // 写/操作端点仍守 /finance/payable。
  @Get(':id')
  @RequireMenu('/departure')
  getById(
    @Req() request: { user: { organizationId: string } },
    @Param('id') id: string,
  ): Promise<PaymentScheduleDetail> {
    return this.paymentScheduleService.getById(
      request.user.organizationId,
      PaymentScheduleDirection.payable,
      id,
    )
  }

  @Patch(':id')
  @RequireMenu('/finance/payable')
  update(
    @Req() request: { user: { organizationId: string; userId: string } },
    @Param('id') id: string,
    @Body() dto: UpdatePaymentScheduleDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<PaymentScheduleSummary> {
    return this.financeIdempotencyService.execute({
      organizationId: request.user.organizationId,
      operation: 'update-payable',
      idempotencyKey,
      request: { scheduleId: id, dto, userId: request.user.userId },
      handler: (tx) =>
        this.paymentScheduleService.update(
          request.user.organizationId,
          PaymentScheduleDirection.payable,
          id,
          dto,
          tx,
        ),
    })
  }

  @Post(':id/confirm-payment')
  @RequireMenu('/finance/payable')
  confirmPayment(
    @Req() request: { user: { organizationId: string; userId: string } },
    @Param('id') id: string,
    @Body() dto: ConfirmPaymentDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<PaymentScheduleSummary> {
    return this.financeOperationsService.confirmPayment(
      request.user.organizationId,
      id,
      dto,
      request.user.userId,
      idempotencyKey,
    )
  }

  @Post(':id/link-transaction')
  @RequireMenu('/finance/payable')
  linkTransaction(
    @Req() request: { user: { organizationId: string; userId: string } },
    @Param('id') id: string,
    @Body() dto: LinkTransactionDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<PaymentScheduleSummary> {
    return this.financeOperationsService.linkTransaction(
      request.user.organizationId,
      PaymentScheduleDirection.payable,
      id,
      dto,
      request.user.userId,
      idempotencyKey,
    )
  }
}
