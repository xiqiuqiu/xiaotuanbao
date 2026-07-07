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

@Controller('finance/receivables')
@UseGuards(JwtAuthGuard, MenuPermissionGuard)
export class ReceivableController {
  constructor(private readonly paymentScheduleService: PaymentScheduleService) {}

  @Get()
  @RequireMenu('/finance/receivable')
  list(
    @Req() request: { user: { organizationId: string } },
    @Query() query: ListPaymentSchedulesQueryDto,
  ): Promise<PaymentScheduleListResult> {
    return this.paymentScheduleService.list(
      request.user.organizationId,
      PaymentScheduleDirection.receivable,
      query,
    )
  }

  @Post()
  @RequireMenu('/finance/receivable')
  create(
    @Req() request: { user: { organizationId: string } },
    @Body() dto: CreatePaymentScheduleDto,
  ): Promise<PaymentScheduleSummary> {
    return this.paymentScheduleService.create(
      request.user.organizationId,
      PaymentScheduleDirection.receivable,
      dto,
    )
  }

  @Get(':id')
  @RequireMenu('/finance/receivable')
  getById(
    @Req() request: { user: { organizationId: string } },
    @Param('id') id: string,
  ): Promise<PaymentScheduleSummary> {
    return this.paymentScheduleService.getById(
      request.user.organizationId,
      PaymentScheduleDirection.receivable,
      id,
    )
  }

  @Patch(':id')
  @RequireMenu('/finance/receivable')
  update(
    @Req() request: { user: { organizationId: string } },
    @Param('id') id: string,
    @Body() dto: UpdatePaymentScheduleDto,
  ): Promise<PaymentScheduleSummary> {
    return this.paymentScheduleService.update(
      request.user.organizationId,
      PaymentScheduleDirection.receivable,
      id,
      dto,
    )
  }
}
