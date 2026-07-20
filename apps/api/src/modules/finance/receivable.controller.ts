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
import { ConfirmCollectionDto, LinkTransactionDto } from './dto/finance-operations.dto'
import { FinanceIdempotencyService } from './finance-idempotency.service'

@Controller('finance/receivables')
@UseGuards(JwtAuthGuard, MenuPermissionGuard)
export class ReceivableController {
  constructor(
    private readonly paymentScheduleService: PaymentScheduleService,
    private readonly financeOperationsService: FinanceOperationsService,
    private readonly financeIdempotencyService: FinanceIdempotencyService,
  ) {}

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
    @Req() request: { user: { organizationId: string; userId: string } },
    @Body() dto: CreatePaymentScheduleDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<PaymentScheduleSummary> {
    return this.financeIdempotencyService.execute({
      organizationId: request.user.organizationId,
      operation: 'create-receivable',
      idempotencyKey,
      request: { dto, userId: request.user.userId },
      handler: (tx) =>
        this.paymentScheduleService.create(
          request.user.organizationId,
          PaymentScheduleDirection.receivable,
          dto,
          tx,
        ),
    })
  }

  // ADR-0024：收付款节点必挂发团，其**详情读**按 /departure 放行——计调在发团详情/
  // 合作伙伴/供应商往来账款列表（业务菜单放行）可见节点行，点节点编号看详情应一致可读；
  // 财务预设亦持 /departure。写/操作端点仍守 /finance/receivable，计调不能改账款。
  @Get(':id')
  @RequireMenu('/departure')
  getById(
    @Req() request: { user: { organizationId: string } },
    @Param('id') id: string,
  ): Promise<PaymentScheduleDetail> {
    return this.paymentScheduleService.getById(
      request.user.organizationId,
      PaymentScheduleDirection.receivable,
      id,
    )
  }

  @Patch(':id')
  @RequireMenu('/finance/receivable')
  update(
    @Req() request: { user: { organizationId: string; userId: string } },
    @Param('id') id: string,
    @Body() dto: UpdatePaymentScheduleDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<PaymentScheduleSummary> {
    return this.financeIdempotencyService.execute({
      organizationId: request.user.organizationId,
      operation: 'update-receivable',
      idempotencyKey,
      request: { scheduleId: id, dto, userId: request.user.userId },
      handler: (tx) =>
        this.paymentScheduleService.update(
          request.user.organizationId,
          PaymentScheduleDirection.receivable,
          id,
          dto,
          tx,
        ),
    })
  }

  @Post(':id/confirm-collection')
  @RequireMenu('/finance/receivable')
  confirmCollection(
    @Req() request: { user: { organizationId: string; userId: string } },
    @Param('id') id: string,
    @Body() dto: ConfirmCollectionDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<PaymentScheduleSummary> {
    return this.financeOperationsService.confirmCollection(
      request.user.organizationId,
      id,
      dto,
      request.user.userId,
      idempotencyKey,
    )
  }

  @Post(':id/link-transaction')
  @RequireMenu('/finance/receivable')
  linkTransaction(
    @Req() request: { user: { organizationId: string; userId: string } },
    @Param('id') id: string,
    @Body() dto: LinkTransactionDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<PaymentScheduleSummary> {
    return this.financeOperationsService.linkTransaction(
      request.user.organizationId,
      PaymentScheduleDirection.receivable,
      id,
      dto,
      request.user.userId,
      idempotencyKey,
    )
  }
}
