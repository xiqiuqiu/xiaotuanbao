import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common'
import type {
  FinanceVerificationListResult,
  FinanceVerificationSummary,
} from '@xiaotuanbao/shared'
import { RequireMenu } from '../../common/decorators/require-menu.decorator'
import { MenuPermissionGuard } from '../../common/guards/menu-permission.guard'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import {
  CancelFinanceVerificationDto,
  CreateFinanceVerificationDto,
  ListFinanceVerificationsQueryDto,
} from './dto/verification.dto'
import { VerificationService } from './verification.service'

@Controller('finance/verifications')
@UseGuards(JwtAuthGuard, MenuPermissionGuard)
export class VerificationController {
  constructor(private readonly verificationService: VerificationService) {}

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
  create(
    @Req() request: { user: { organizationId: string; userId: string } },
    @Body() dto: CreateFinanceVerificationDto,
  ): Promise<FinanceVerificationSummary> {
    return this.verificationService.create(request.user.organizationId, dto, {
      createdBy: request.user.userId,
    })
  }

  @Get(':id')
  @RequireMenu('/finance/verification')
  getById(
    @Req() request: { user: { organizationId: string } },
    @Param('id') id: string,
  ): Promise<FinanceVerificationSummary> {
    return this.verificationService.getById(request.user.organizationId, id)
  }

  @Post(':id/cancel')
  @RequireMenu('/finance/verification')
  cancel(
    @Req() request: { user: { organizationId: string; userId: string } },
    @Param('id') id: string,
    @Body() dto: CancelFinanceVerificationDto,
  ): Promise<FinanceVerificationSummary> {
    return this.verificationService.cancel(
      request.user.organizationId,
      id,
      dto,
      request.user.userId,
    )
  }
}
