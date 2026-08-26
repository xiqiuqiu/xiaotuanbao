import { Body, Controller, Get, HttpCode, Param, Post, Req, UseGuards } from '@nestjs/common'
import type { AiCreateAssistSession, AiCreateAssistTaskState, AiCreateTaskSummary } from '@xiaotuanbao/shared'
import { RequireMenu } from '../../common/decorators/require-menu.decorator'
import { MenuPermissionGuard } from '../../common/guards/menu-permission.guard'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { AgentTaskService } from './agent-task.service'
import { AiConversationService } from './ai-conversation.service'
import { AiCreateTaskService } from './ai-create-task.service'
import { CloseAgentTaskDto, LinkAgentTaskConversationDto } from './dto/agent-task.dto'
import { StartAiCreateAssistSessionDto } from './dto/ai-create-task.dto'

@Controller('agent/tasks')
@UseGuards(JwtAuthGuard, MenuPermissionGuard)
export class AgentTaskController {
  constructor(
    private readonly agentTaskService: AgentTaskService,
    private readonly aiCreateTaskService: AiCreateTaskService,
    private readonly conversationService: AiConversationService,
  ) {}

  @Post('departure-creation/sessions')
  @HttpCode(201)
  @RequireMenu('departure:write')
  startDepartureCreationSession(
    @Req() request: { user: { organizationId: string; userId: string } },
    @Body() dto: StartAiCreateAssistSessionDto,
  ): Promise<AiCreateAssistSession> {
    return this.aiCreateTaskService.startAssistSession(
      request.user.organizationId,
      request.user.userId,
      dto,
    )
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

  @Get(':taskId/runtime-state')
  @RequireMenu('departure:write')
  getRuntimeState(
    @Req() request: { user: { organizationId: string; userId: string } },
    @Param('taskId') taskId: string,
  ): Promise<AiCreateAssistTaskState> {
    return this.conversationService.getTaskEntryState(
      request.user.organizationId,
      request.user.userId,
      taskId,
    )
  }

  @Post(':taskId/conversations/:conversationId')
  @HttpCode(201)
  @RequireMenu('departure:write')
  linkConversation(
    @Req() request: { user: { organizationId: string; userId: string } },
    @Param('taskId') taskId: string,
    @Param('conversationId') conversationId: string,
    @Body() dto: LinkAgentTaskConversationDto,
  ) {
    return this.agentTaskService.linkConversation(
      request.user.organizationId,
      request.user.userId,
      taskId,
      conversationId,
      dto.linkReason,
    )
  }

  @Post(':taskId/close')
  @HttpCode(200)
  @RequireMenu('departure:write')
  close(
    @Req() request: { user: { organizationId: string; userId: string } },
    @Param('taskId') taskId: string,
    @Body() dto: CloseAgentTaskDto,
  ) {
    return this.agentTaskService.close(
      request.user.organizationId,
      request.user.userId,
      taskId,
      dto.expectedStatusVersion,
    )
  }

  @Post(':taskId/cancel')
  @HttpCode(200)
  @RequireMenu('departure:write')
  cancel(
    @Req() request: { user: { organizationId: string; userId: string } },
    @Param('taskId') taskId: string,
    @Body() dto: CloseAgentTaskDto,
  ) {
    return this.agentTaskService.cancel(
      request.user.organizationId,
      request.user.userId,
      taskId,
      dto.expectedStatusVersion,
    )
  }
}
