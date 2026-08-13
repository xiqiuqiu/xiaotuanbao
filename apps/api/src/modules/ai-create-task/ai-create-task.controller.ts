import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common'
import type { AiCreateAssistAvailability, AiCreateAssistSession, AiCreateTaskSummary, DepartureSummary } from '@xiaotuanbao/shared'
import type { Response } from 'express'
import { RequireMenu } from '../../common/decorators/require-menu.decorator'
import { MenuPermissionGuard } from '../../common/guards/menu-permission.guard'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { AiCreateTaskService } from './ai-create-task.service'
import {
  ConfirmAiCreateTaskDto,
  ConfirmAiReviewPackageDto,
  PatchAiReviewPackageDto,
  SaveDepartureCreationDraftDto,
  StartAiCreateAssistSessionDto,
} from './dto/ai-create-task.dto'

@Controller('ai-create-tasks')
@UseGuards(JwtAuthGuard, MenuPermissionGuard)
export class AiCreateTaskController {
  constructor(private readonly aiCreateTaskService: AiCreateTaskService) {}

  @Get('assist-availability')
  getAssistAvailability(
    @Req() request: { user: { userId: string } },
  ): Promise<AiCreateAssistAvailability> {
    return this.aiCreateTaskService.getAssistAvailability(request.user.userId)
  }

  @Post('assist-session')
  @HttpCode(201)
  @RequireMenu('departure:write')
  startAssistSession(
    @Req() request: { user: { organizationId: string; userId: string } },
    @Body() dto: StartAiCreateAssistSessionDto,
  ): Promise<AiCreateAssistSession> {
    return this.aiCreateTaskService.startAssistSession(
      request.user.organizationId,
      request.user.userId,
      dto,
    )
  }

  @Post('draft')
  @RequireMenu('departure:write')
  async saveDraft(
    @Req() request: { user: { organizationId: string; userId: string } },
    @Body() dto: SaveDepartureCreationDraftDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AiCreateTaskSummary> {
    const result = await this.aiCreateTaskService.saveDraft(
      request.user.organizationId,
      request.user.userId,
      dto,
    )
    res.status(dto.taskId ? 200 : 201)
    return result
  }

  @Get(':taskId')
  @RequireMenu('departure:write')
  getTask(
    @Req() request: { user: { organizationId: string; userId: string } },
    @Param('taskId') taskId: string,
  ): Promise<AiCreateTaskSummary> {
    return this.aiCreateTaskService.getTask(
      request.user.organizationId,
      request.user.userId,
      taskId,
    )
  }

  @Post(':taskId/confirm')
  @HttpCode(201)
  @RequireMenu('departure:write')
  confirm(
    @Req() request: { user: { organizationId: string; userId: string } },
    @Param('taskId') taskId: string,
    @Body() dto: ConfirmAiCreateTaskDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<DepartureSummary> {
    return this.aiCreateTaskService.confirm(
      request.user.organizationId,
      request.user.userId,
      taskId,
      dto,
      idempotencyKey,
    )
  }

  @Patch(':taskId/review-packages/:packageId')
  @RequireMenu('departure:write')
  patchReviewPackage(
    @Req() request: { user: { organizationId: string; userId: string } },
    @Param('taskId') taskId: string,
    @Param('packageId') packageId: string,
    @Body() dto: PatchAiReviewPackageDto,
  ): Promise<AiCreateTaskSummary> {
    return this.aiCreateTaskService.patchReviewPackage(
      request.user.organizationId,
      request.user.userId,
      taskId,
      packageId,
      dto,
    )
  }

  @Post(':taskId/review-packages/:packageId/confirm')
  @HttpCode(200)
  @RequireMenu('departure:write')
  confirmReviewPackage(
    @Req() request: { user: { organizationId: string; userId: string } },
    @Param('taskId') taskId: string,
    @Param('packageId') packageId: string,
    @Body() dto: ConfirmAiReviewPackageDto,
  ): Promise<AiCreateTaskSummary> {
    return this.aiCreateTaskService.confirmReviewPackage(
      request.user.organizationId,
      request.user.userId,
      taskId,
      packageId,
      dto,
    )
  }

  @Post(':taskId/review-packages/:packageId/reject')
  @HttpCode(200)
  @RequireMenu('departure:write')
  rejectReviewPackage(
    @Req() request: { user: { organizationId: string; userId: string } },
    @Param('taskId') taskId: string,
    @Param('packageId') packageId: string,
  ): Promise<AiCreateTaskSummary> {
    return this.aiCreateTaskService.rejectReviewPackage(
      request.user.organizationId,
      request.user.userId,
      taskId,
      packageId,
    )
  }
}
