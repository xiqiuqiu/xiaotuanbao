import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  Req,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common'
import type {
  AiConversationDraftView,
  AiConversationView,
  ConversationHistoryItem,
  ConversationHistoryPage,
  ConversationSourceView,
  SendAiConversationMessageResult,
} from '@xiaotuanbao/shared'
import { FilesInterceptor } from '@nestjs/platform-express'
import { memoryStorage } from 'multer'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { MenuPermissionGuard } from '../../common/guards/menu-permission.guard'
import { AiConversationService } from './ai-conversation.service'
import { DepartureMaterialService } from './departure-material.service'
import { MATERIAL_MAX_BYTES, MATERIAL_MAX_FILES_PER_SEND } from './departure-material.constants'
import {
  ListAgentConversationsQueryDto,
  ListAiConversationEventsQueryDto,
  SaveAiConversationTextDraftDto,
  SendAiConversationMessageDto,
} from './dto/ai-create-task.dto'

@Controller('agent/conversations')
@UseGuards(JwtAuthGuard, MenuPermissionGuard)
export class AgentConversationController {
  constructor(
    private readonly conversationService: AiConversationService,
    private readonly materialService: DepartureMaterialService,
  ) {}

  @Get()
  listConversations(
    @Req() request: { user: { organizationId: string; userId: string } },
    @Query() query: ListAgentConversationsQueryDto,
  ): Promise<ConversationHistoryPage> {
    return this.conversationService.listOwnedConversations(
      request.user.organizationId,
      request.user.userId,
      query,
    )
  }

  @Post('messages')
  @HttpCode(201)
  @UseInterceptors(
    FilesInterceptor('files', MATERIAL_MAX_FILES_PER_SEND, {
      storage: memoryStorage(),
      limits: {
        fileSize: MATERIAL_MAX_BYTES,
        files: MATERIAL_MAX_FILES_PER_SEND,
      },
    }),
  )
  sendFirstMessage(
    @Req() request: { user: { organizationId: string; userId: string } },
    @Body() dto: SendAiConversationMessageDto,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<SendAiConversationMessageResult> {
    return this.conversationService.sendTasklessText(
      request.user.organizationId,
      request.user.userId,
      undefined,
      dto.text ?? '',
      idempotencyKey,
      {
        replyToEventId: dto.replyToEventId,
        interactionId: dto.interactionId,
        interactionVersion: dto.interactionVersion,
        selectedOptionId: dto.selectedOptionId,
      },
      (files ?? []).map((file) => ({
        originalname: file.originalname,
        mimetype: file.mimetype,
        buffer: file.buffer,
        size: file.size,
      })),
    )
  }

  @Post(':conversationId/messages')
  @HttpCode(201)
  @UseInterceptors(
    FilesInterceptor('files', MATERIAL_MAX_FILES_PER_SEND, {
      storage: memoryStorage(),
      limits: {
        fileSize: MATERIAL_MAX_BYTES,
        files: MATERIAL_MAX_FILES_PER_SEND,
      },
    }),
  )
  sendMessage(
    @Req() request: { user: { organizationId: string; userId: string } },
    @Param('conversationId') conversationId: string,
    @Body() dto: SendAiConversationMessageDto,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<SendAiConversationMessageResult> {
    return this.conversationService.sendTasklessText(
      request.user.organizationId,
      request.user.userId,
      conversationId,
      dto.text ?? '',
      idempotencyKey,
      {
        replyToEventId: dto.replyToEventId,
        interactionId: dto.interactionId,
        interactionVersion: dto.interactionVersion,
        selectedOptionId: dto.selectedOptionId,
      },
      (files ?? []).map((file) => ({
        originalname: file.originalname,
        mimetype: file.mimetype,
        buffer: file.buffer,
        size: file.size,
      })),
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

  @Post(':conversationId/archive')
  @HttpCode(200)
  archiveConversation(
    @Req() request: { user: { organizationId: string; userId: string } },
    @Param('conversationId') conversationId: string,
  ): Promise<ConversationHistoryItem> {
    return this.conversationService.archiveOwnedConversation(
      request.user.organizationId,
      request.user.userId,
      conversationId,
    )
  }

  @Put(':conversationId/draft')
  saveDraft(
    @Req() request: { user: { organizationId: string; userId: string } },
    @Param('conversationId') conversationId: string,
    @Body() dto: SaveAiConversationTextDraftDto,
  ): Promise<AiConversationDraftView> {
    return this.conversationService.saveTasklessDraft(
      request.user.organizationId,
      request.user.userId,
      conversationId,
      dto.text,
      dto.draftEpoch,
    )
  }

  @Post(':conversationId/unarchive')
  @HttpCode(200)
  unarchiveConversation(
    @Req() request: { user: { organizationId: string; userId: string } },
    @Param('conversationId') conversationId: string,
  ): Promise<ConversationHistoryItem> {
    return this.conversationService.unarchiveOwnedConversation(
      request.user.organizationId,
      request.user.userId,
      conversationId,
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

  @Get(':conversationId/sources')
  listSources(
    @Req() request: { user: { organizationId: string; userId: string } },
    @Param('conversationId') conversationId: string,
  ): Promise<ConversationSourceView[]> {
    return this.materialService.listConversationSources(
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
