import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common'
import type { AiConversationView, SendAiConversationMessageResult } from '@xiaotuanbao/shared'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { MenuPermissionGuard } from '../../common/guards/menu-permission.guard'
import { AiConversationService } from './ai-conversation.service'
import {
  ListAiConversationEventsQueryDto,
  SendAiConversationMessageDto,
} from './dto/ai-create-task.dto'

@Controller('agent/conversations')
@UseGuards(JwtAuthGuard, MenuPermissionGuard)
export class AgentConversationController {
  constructor(private readonly conversationService: AiConversationService) {}

  @Post('messages')
  @HttpCode(201)
  sendFirstMessage(
    @Req() request: { user: { organizationId: string; userId: string } },
    @Body() dto: SendAiConversationMessageDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<SendAiConversationMessageResult> {
    return this.conversationService.sendTasklessText(
      request.user.organizationId,
      request.user.userId,
      undefined,
      dto.text ?? '',
      idempotencyKey,
    )
  }

  @Post(':conversationId/messages')
  @HttpCode(201)
  sendMessage(
    @Req() request: { user: { organizationId: string; userId: string } },
    @Param('conversationId') conversationId: string,
    @Body() dto: SendAiConversationMessageDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<SendAiConversationMessageResult> {
    return this.conversationService.sendTasklessText(
      request.user.organizationId,
      request.user.userId,
      conversationId,
      dto.text ?? '',
      idempotencyKey,
    )
  }

  @Post(':conversationId/stop')
  @HttpCode(200)
  stopRun(
    @Req() request: { user: { organizationId: string; userId: string } },
    @Param('conversationId') conversationId: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<SendAiConversationMessageResult> {
    return this.conversationService.stopTasklessRun(
      request.user.organizationId,
      request.user.userId,
      conversationId,
      idempotencyKey,
    )
  }

  @Get(':conversationId')
  getConversation(
    @Req() request: { user: { organizationId: string; userId: string } },
    @Param('conversationId') conversationId: string,
  ): Promise<AiConversationView> {
    return this.conversationService.getTasklessConversation(
      request.user.organizationId,
      request.user.userId,
      conversationId,
    )
  }

  @Get(':conversationId/events')
  listEvents(
    @Req() request: { user: { organizationId: string; userId: string } },
    @Param('conversationId') conversationId: string,
    @Query() query: ListAiConversationEventsQueryDto,
  ) {
    return this.conversationService.listTasklessEvents(
      request.user.organizationId,
      request.user.userId,
      conversationId,
      query.afterSequence ?? 0,
    )
  }
}
