import { Body, Controller, Get, Headers, Param, Post, Query, Req, UseGuards } from '@nestjs/common'
import type {
  FinanceVerificationDetail,
  FinanceVerificationListResult,
  FinanceVerificationSummary,
} from '@xiaotuanbao/shared'
import { RequireMenu } from '../../common/decorators/require-menu.decorator'
import { MenuPermissionGuard } from '../../common/guards/menu-permission.guard'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { DepartureFinanceFacade } from './departure-finance-facade.service'
import {
  CancelFinanceVerificationDto,
  CreateFinanceVerificationDto,
  ListFinanceVerificationsQueryDto,
} from './dto/verification.dto'
import { VerificationService } from './verification.service'
import { FinanceIdempotencyService } from './finance-idempotency.service'

@Controller('finance/verifications')
@UseGuards(JwtAuthGuard, MenuPermissionGuard)
export class VerificationController {
  constructor(
    private readonly verificationService: VerificationService,
    private readonly financeIdempotencyService: FinanceIdempotencyService,
    private readonly departureFinanceFacade: DepartureFinanceFacade,
  ) {}

  @Get()
  @RequireMenu('/finance/verification')
  list(
    @Req() request: { user: { organizationId: string } },
    @Query() query: ListFinanceVerificationsQueryDto,
  ): Promise<FinanceVerificationListResult> {
    return this.verificationService.list(request.user.organizationId, query)
  }

  @Post()
  @RequireMenu('/finance/verification')
  async create(
    @Req() request: { user: { organizationId: string; userId: string } },
    @Body() dto: CreateFinanceVerificationDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<FinanceVerificationSummary> {
    const verification = await this.financeIdempotencyService.execute({
      organizationId: request.user.organizationId,
      operation: 'create-verification',
      idempotencyKey,
      request: { dto, userId: request.user.userId },
      handler: (tx) =>
        this.verificationService.create(
          request.user.organizationId,
          dto,
          { createdBy: request.user.userId },
          tx,
        ),
    })

    const generatedRebatePayable =
      await this.departureFinanceFacade.syncActualCollectionSettlementAfterGuestVerification(
        request.user.organizationId,
        dto.paymentScheduleId,
      )

    return { ...verification, generatedRebatePayable }
  }

  @Get(':id')
  @RequireMenu('/finance/verification')
  getById(
    @Req() request: { user: { organizationId: string } },
    @Param('id') id: string,
  ): Promise<FinanceVerificationDetail> {
    return this.verificationService.getDetail(request.user.organizationId, id)
  }

  @Post(':id/cancel')
  @RequireMenu('/finance/verification')
  cancel(
    @Req() request: { user: { organizationId: string; userId: string } },
    @Param('id') id: string,
    @Body() dto: CancelFinanceVerificationDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<FinanceVerificationSummary> {
    return this.financeIdempotencyService.execute({
      organizationId: request.user.organizationId,
      operation: 'cancel-verification',
      idempotencyKey,
      request: { verificationId: id, dto, userId: request.user.userId },
      handler: (tx) =>
        this.verificationService.cancel(
          request.user.organizationId,
          id,
          dto,
          request.user.userId,
          tx,
        ),
    })
  }
}
