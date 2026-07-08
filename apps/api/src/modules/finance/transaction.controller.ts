import { Body, Controller, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common'
import type {
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

@Controller('finance/transactions')
@UseGuards(JwtAuthGuard, MenuPermissionGuard)
export class TransactionController {
  constructor(private readonly transactionService: TransactionService) {}

  @Get()
  @RequireMenu('/finance/transactions')
  list(
    @Req() request: { user: { organizationId: string } },
    @Query() query: ListFinanceTransactionsQueryDto,
  ): Promise<FinanceTransactionListResult> {
    return this.transactionService.list(request.user.organizationId, query)
  }

  @Post()
  @RequireMenu('/finance/transactions')
  create(
    @Req() request: { user: { organizationId: string } },
    @Body() dto: CreateFinanceTransactionDto,
  ): Promise<FinanceTransactionSummary> {
    return this.transactionService.create(request.user.organizationId, dto)
  }

  @Put(':id')
  @RequireMenu('/finance/transactions')
  update(
    @Req() request: { user: { organizationId: string } },
    @Param('id') id: string,
    @Body() dto: UpdateFinanceTransactionDto,
  ): Promise<FinanceTransactionSummary> {
    return this.transactionService.update(request.user.organizationId, id, dto)
  }

  @Get(':id')
  @RequireMenu('/finance/transactions')
  getById(
    @Req() request: { user: { organizationId: string } },
    @Param('id') id: string,
  ): Promise<FinanceTransactionSummary> {
    return this.transactionService.getById(request.user.organizationId, id)
  }

  @Post(':id/void')
  @RequireMenu('/finance/transactions')
  voidTransaction(
    @Req() request: { user: { organizationId: string } },
    @Param('id') id: string,
    @Body() dto: VoidFinanceTransactionDto,
  ): Promise<FinanceTransactionSummary> {
    return this.transactionService.void(request.user.organizationId, id, dto)
  }
}
