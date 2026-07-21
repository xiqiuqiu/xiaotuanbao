import { Body, Controller, Get, Headers, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common'
import type {
  FinanceTransactionDetail,
  FinanceTransactionListResult,
  FinanceTransactionSummary,
} from '@xiaotuanbao/shared'
import { RequireMenu } from '../../common/decorators/require-menu.decorator'
import { MenuPermissionGuard } from '../../common/guards/menu-permission.guard'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import {
  CreateFinanceTransactionDto,
  ListFinanceTransactionsQueryDto,
  UpdateFinanceTransactionDto,
  VoidFinanceTransactionDto,
} from './dto/transaction.dto'
import { TransactionService } from './transaction.service'
import { FinanceIdempotencyService } from './finance-idempotency.service'

@Controller('finance/transactions')
@UseGuards(JwtAuthGuard, MenuPermissionGuard)
export class TransactionController {
  constructor(
    private readonly transactionService: TransactionService,
    private readonly financeIdempotencyService: FinanceIdempotencyService,
  ) {}

  @Get()
  @RequireMenu('/finance/transactions')
  list(
    @Req() request: { user: { organizationId: string; userId: string } },
    @Query() query: ListFinanceTransactionsQueryDto,
  ): Promise<FinanceTransactionListResult> {
    return this.transactionService.list(request.user.organizationId, query)
  }

  @Post()
  @RequireMenu('/finance/transactions')
  create(
    @Req() request: { user: { organizationId: string; userId: string } },
    @Body() dto: CreateFinanceTransactionDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<FinanceTransactionSummary> {
    return this.financeIdempotencyService.execute({
      organizationId: request.user.organizationId,
      operation: 'create-transaction',
      idempotencyKey,
      request: { dto, userId: request.user.userId },
      handler: (tx) => this.transactionService.create(request.user.organizationId, dto, tx),
    })
  }

  @Put(':id')
  @RequireMenu('/finance/transactions')
  update(
    @Req() request: { user: { organizationId: string; userId: string } },
    @Param('id') id: string,
    @Body() dto: UpdateFinanceTransactionDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<FinanceTransactionSummary> {
    return this.financeIdempotencyService.execute({
      organizationId: request.user.organizationId,
      operation: 'update-transaction',
      idempotencyKey,
      request: { transactionId: id, dto, userId: request.user.userId },
      handler: (tx) =>
        this.transactionService.update(request.user.organizationId, id, dto, tx),
    })
  }

  @Get(':id')
  @RequireMenu('/finance/transactions')
  getById(
    @Req() request: { user: { organizationId: string } },
    @Param('id') id: string,
  ): Promise<FinanceTransactionDetail> {
    return this.transactionService.getById(request.user.organizationId, id)
  }

  @Post(':id/void')
  @RequireMenu('/finance/transactions')
  voidTransaction(
    @Req() request: { user: { organizationId: string; userId: string } },
    @Param('id') id: string,
    @Body() dto: VoidFinanceTransactionDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<FinanceTransactionSummary> {
    return this.financeIdempotencyService.execute({
      organizationId: request.user.organizationId,
      operation: 'void-transaction',
      idempotencyKey,
      request: { transactionId: id, dto, userId: request.user.userId },
      handler: (tx) =>
        this.transactionService.void(request.user.organizationId, id, dto, tx),
    })
  }

  @Post(':id/acknowledge-source-amount-change')
  @RequireMenu('/finance/transactions')
  acknowledgeSourceAmountChange(
    @Req() request: { user: { organizationId: string; userId: string } },
    @Param('id') id: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<FinanceTransactionSummary> {
    return this.financeIdempotencyService.execute({
      organizationId: request.user.organizationId,
      operation: 'acknowledge-source-amount-change',
      idempotencyKey,
      request: { transactionId: id, userId: request.user.userId },
      handler: (tx) =>
        this.transactionService.acknowledgeSourceAmountChange(
          request.user.organizationId,
          id,
          tx,
        ),
    })
  }
}
