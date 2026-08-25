import { Body, Controller, HttpCode, Param, Post, Req, UseGuards } from '@nestjs/common'
import { RequireMenu } from '../../common/decorators/require-menu.decorator'
import { MenuPermissionGuard } from '../../common/guards/menu-permission.guard'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { AgentTaskService } from './agent-task.service'
import { CloseAgentTaskDto, LinkAgentTaskConversationDto } from './dto/agent-task.dto'

@Controller('agent/tasks')
@UseGuards(JwtAuthGuard, MenuPermissionGuard)
export class AgentTaskController {
  constructor(private readonly agentTaskService: AgentTaskService) {}

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
