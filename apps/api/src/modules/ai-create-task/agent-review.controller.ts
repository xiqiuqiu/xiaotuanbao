import { Body, Controller, Headers, HttpCode, Param, Patch, Post, Req, UseGuards } from '@nestjs/common'
import type { AiCreateTaskSummary } from '@xiaotuanbao/shared'
import { RequireMenu } from '../../common/decorators/require-menu.decorator'
import { MenuPermissionGuard } from '../../common/guards/menu-permission.guard'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { AiCreateTaskService } from './ai-create-task.service'
import {
  CancelAiReviewPackageDto,
  ConfirmAiReviewPackageDto,
  PatchAiReviewPackageDto,
  RejectAiReviewPackageDto,
} from './dto/ai-create-task.dto'

@Controller('agent/review-packages')
@UseGuards(JwtAuthGuard, MenuPermissionGuard)
export class AgentReviewController {
  constructor(private readonly aiCreateTaskService: AiCreateTaskService) {}

  @Patch(':packageId')
  @RequireMenu('departure:write')
  async patch(
    @Req() request: { user: { organizationId: string; userId: string } },
    @Param('packageId') packageId: string,
    @Body() dto: PatchAiReviewPackageDto,
  ): Promise<AiCreateTaskSummary> {
    const taskId = await this.aiCreateTaskService.resolveOwnedReviewTaskId(
      request.user.organizationId,
      request.user.userId,
      packageId,
    )
    return this.aiCreateTaskService.patchReviewPackage(
      request.user.organizationId,
      request.user.userId,
      taskId,
      packageId,
      dto,
    )
  }

  @Post(':packageId/confirm')
  @HttpCode(200)
  @RequireMenu('departure:write')
  async confirm(
    @Req() request: { user: { organizationId: string; userId: string } },
    @Param('packageId') packageId: string,
    @Body() dto: ConfirmAiReviewPackageDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<AiCreateTaskSummary> {
    const taskId = await this.aiCreateTaskService.resolveOwnedReviewTaskId(
      request.user.organizationId,
      request.user.userId,
      packageId,
    )
    return this.aiCreateTaskService.confirmReviewPackage(
      request.user.organizationId,
      request.user.userId,
      taskId,
      packageId,
      dto,
      dto.decisionCommandId ?? idempotencyKey,
    )
  }

  @Post(':packageId/reject')
  @HttpCode(200)
  @RequireMenu('departure:write')
  async reject(
    @Req() request: { user: { organizationId: string; userId: string } },
    @Param('packageId') packageId: string,
    @Body() dto: RejectAiReviewPackageDto,
  ): Promise<AiCreateTaskSummary> {
    const taskId = await this.aiCreateTaskService.resolveOwnedReviewTaskId(
      request.user.organizationId,
      request.user.userId,
      packageId,
    )
    return this.aiCreateTaskService.rejectReviewPackage(
      request.user.organizationId,
      request.user.userId,
      taskId,
      packageId,
      dto,
    )
  }

  @Post(':packageId/cancel')
  @HttpCode(200)
  @RequireMenu('departure:write')
  async cancel(
    @Req() request: { user: { organizationId: string; userId: string } },
    @Param('packageId') packageId: string,
    @Body() dto: CancelAiReviewPackageDto,
  ): Promise<AiCreateTaskSummary> {
    const taskId = await this.aiCreateTaskService.resolveOwnedReviewTaskId(
      request.user.organizationId,
      request.user.userId,
      packageId,
    )
    return this.aiCreateTaskService.cancelReviewPackage(
      request.user.organizationId,
      request.user.userId,
      taskId,
      packageId,
      dto,
    )
  }

  @Post(':packageId/regenerate')
  @HttpCode(200)
  @RequireMenu('departure:write')
  async regenerate(
    @Req() request: { user: { organizationId: string; userId: string } },
    @Param('packageId') packageId: string,
  ): Promise<AiCreateTaskSummary> {
    const taskId = await this.aiCreateTaskService.resolveOwnedReviewTaskId(
      request.user.organizationId,
      request.user.userId,
      packageId,
    )
    return this.aiCreateTaskService.regenerateReviewPackage(
      request.user.organizationId,
      request.user.userId,
      taskId,
      packageId,
    )
  }
}
