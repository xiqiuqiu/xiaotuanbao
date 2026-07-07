import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common'
import type { PaymentScheduleListResult, PaymentScheduleSummary } from '@xiaotuanbao/shared'
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

@Controller('finance/payables')
@UseGuards(JwtAuthGuard, MenuPermissionGuard)
export class PayableController {
  constructor(
    private readonly paymentScheduleService: PaymentScheduleService,
    private readonly financeOperationsService: FinanceOperationsService,
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
    @Req() request: { user: { organizationId: string } },
    @Body() dto: CreatePaymentScheduleDto,
  ): Promise<PaymentScheduleSummary> {
    return this.paymentScheduleService.create(
      request.user.organizationId,
      PaymentScheduleDirection.payable,
      dto,
    )
  }

  @Get(':id')
  @RequireMenu('/finance/payable')
  getById(
    @Req() request: { user: { organizationId: string } },
    @Param('id') id: string,
  ): Promise<PaymentScheduleSummary> {
    return this.paymentScheduleService.getById(
      request.user.organizationId,
      PaymentScheduleDirection.payable,
      id,
    )
  }

  @Patch(':id')
  @RequireMenu('/finance/payable')
  update(
    @Req() request: { user: { organizationId: string } },
    @Param('id') id: string,
    @Body() dto: UpdatePaymentScheduleDto,
  ): Promise<PaymentScheduleSummary> {
    return this.paymentScheduleService.update(
      request.user.organizationId,
      PaymentScheduleDirection.payable,
      id,
      dto,
    )
  }

  @Post(':id/confirm-payment')
  @RequireMenu('/finance/payable')
  confirmPayment(
    @Req() request: { user: { organizationId: string } },
    @Param('id') id: string,
    @Body() dto: ConfirmPaymentDto,
  ): Promise<PaymentScheduleSummary> {
    return this.financeOperationsService.confirmPayment(
      request.user.organizationId,
      id,
      dto,
    )
  }

  @Post(':id/link-transaction')
  @RequireMenu('/finance/payable')
  linkTransaction(
    @Req() request: { user: { organizationId: string } },
    @Param('id') id: string,
    @Body() dto: LinkTransactionDto,
  ): Promise<PaymentScheduleSummary> {
    return this.financeOperationsService.linkTransaction(
      request.user.organizationId,
      PaymentScheduleDirection.payable,
      id,
      dto,
    )
  }
}
