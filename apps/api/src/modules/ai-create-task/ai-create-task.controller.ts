import { Body, Controller, Get, Headers, HttpCode, Param, Post, Req, Res, UseGuards } from '@nestjs/common'
import type {
  AiCreateAssistAvailability,
  AiCreateTaskSummary,
  DepartureSummary,
} from '@xiaotuanbao/shared'
import type { Response } from 'express'
import { RequireMenu } from '../../common/decorators/require-menu.decorator'
import { MenuPermissionGuard } from '../../common/guards/menu-permission.guard'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { AiCreateTaskService } from './ai-create-task.service'
import { ConfirmAiCreateTaskDto, SaveDepartureCreationDraftDto } from './dto/ai-create-task.dto'
import { DepartureAgentTaskAdapter } from './departure-agent-task.adapter'

@Controller('ai-create-tasks')
@UseGuards(JwtAuthGuard, MenuPermissionGuard)
export class AiCreateTaskController {
  constructor(
    private readonly aiCreateTaskService: AiCreateTaskService,
    private readonly departureAdapter: DepartureAgentTaskAdapter,
  ) {}

  @Get('assist-availability')
  getAssistAvailability(
    @Req() request: { user: { userId: string } },
  ): Promise<AiCreateAssistAvailability> {
    return this.aiCreateTaskService.getAssistAvailability(request.user.userId)
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

  @Post(':taskId/confirm')
  @HttpCode(201)
  @RequireMenu('departure:write')
  confirm(
    @Req() request: { user: { organizationId: string; userId: string } },
    @Param('taskId') taskId: string,
    @Body() dto: ConfirmAiCreateTaskDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<DepartureSummary> {
    return this.departureAdapter.executeBusinessCommand({
      kind: 'complete',
      organizationId: request.user.organizationId,
      userId: request.user.userId,
      taskId,
      input: dto,
      idempotencyKey,
    })
  }
}
