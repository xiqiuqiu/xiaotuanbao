import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  MessageEvent,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
  Sse,
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
import type { Response } from 'express'
import { Observable } from 'rxjs'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { MenuPermissionGuard } from '../../common/guards/menu-permission.guard'
import { SkipResponseWrap } from '../../common/decorators/skip-response-wrap.decorator'
import { buildStoredObjectContentDisposition } from '../stored-object/stored-object.helpers'
import { AiConversationService } from './ai-conversation.service'
import { DepartureMaterialService } from './departure-material.service'
import { MATERIAL_MAX_BYTES, MATERIAL_MAX_FILES_PER_SEND } from './departure-material.constants'
import {
  CancelAiConversationInteractionDto,
  ListAgentConversationsQueryDto,
  ListAiConversationEventsQueryDto,
  RemoveBatchMaterialsDto,
  RetryFailedMaterialsDto,
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
      dto.pageLocator,
      dto.primaryTaskId,
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
      dto.pageLocator,
      dto.primaryTaskId,
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

  @Get(':conversationId/sources/:sourceId/preview')
  @SkipResponseWrap()
  async previewSource(
    @Req() request: { user: { organizationId: string; userId: string } },
    @Param('conversationId') conversationId: string,
    @Param('sourceId') sourceId: string,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.materialService.previewConversationSource(
      request.user.organizationId,
      request.user.userId,
      conversationId,
      sourceId,
    )
    res.setHeader('Content-Type', file.contentType)
    res.setHeader(
      'Content-Disposition',
      buildStoredObjectContentDisposition(file.filename).replace(/^attachment/, 'inline'),
    )
    res.setHeader('Content-Length', String(file.buffer.byteLength))
    res.send(file.buffer)
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

  @Sse(':conversationId/stream')
  @SkipResponseWrap()
  streamEvents(
    @Req() request: { user: { organizationId: string; userId: string } },
    @Param('conversationId') conversationId: string,
    @Query() query: ListAiConversationEventsQueryDto,
    @Headers('last-event-id') lastEventId?: string,
  ): Promise<Observable<MessageEvent>> {
    return this.conversationService.streamOwnedEvents(
      request.user.organizationId,
      request.user.userId,
      conversationId,
      Math.max(query.afterSequence ?? 0, parseAfterSequence(lastEventId)),
    )
  }

  @Post(':conversationId/interactions/:interactionId/cancel')
  @HttpCode(200)
  cancelInteraction(
    @Req() request: { user: { organizationId: string; userId: string } },
    @Param('conversationId') conversationId: string,
    @Param('interactionId') interactionId: string,
    @Body() dto: CancelAiConversationInteractionDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<SendAiConversationMessageResult> {
    return this.conversationService.cancelInteraction(
      request.user.organizationId,
      request.user.userId,
      undefined,
      conversationId,
      interactionId,
      dto.version,
      idempotencyKey,
    )
  }

  @Post(':conversationId/batches/:batchId/retry-failed-materials')
  @HttpCode(200)
  retryFailedMaterials(
    @Req() request: { user: { organizationId: string; userId: string } },
    @Param('conversationId') conversationId: string,
    @Param('batchId') batchId: string,
    @Body() dto: RetryFailedMaterialsDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<SendAiConversationMessageResult> {
    return this.conversationService.retryFailedMaterials(
      request.user.organizationId,
      request.user.userId,
      undefined,
      conversationId,
      batchId,
      dto.materialIds,
      idempotencyKey,
    )
  }

  @Post(':conversationId/batches/:batchId/remove-materials')
  @HttpCode(200)
  removeBatchMaterials(
    @Req() request: { user: { organizationId: string; userId: string } },
    @Param('conversationId') conversationId: string,
    @Param('batchId') batchId: string,
    @Body() dto: RemoveBatchMaterialsDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<SendAiConversationMessageResult> {
    return this.conversationService.removeMaterials(
      request.user.organizationId,
      request.user.userId,
      undefined,
      conversationId,
      batchId,
      dto.materialIds,
      idempotencyKey,
    )
  }

  @Post(':conversationId/batches/:batchId/abandon')
  @HttpCode(200)
  abandonBatch(
    @Req() request: { user: { organizationId: string; userId: string } },
    @Param('conversationId') conversationId: string,
    @Param('batchId') batchId: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<SendAiConversationMessageResult> {
    return this.conversationService.abandonBatch(
      request.user.organizationId,
      request.user.userId,
      undefined,
      conversationId,
      batchId,
      idempotencyKey,
    )
  }

  @Post(':conversationId/batches/:batchId/stop')
  @HttpCode(200)
  stopBatch(
    @Req() request: { user: { organizationId: string; userId: string } },
    @Param('conversationId') conversationId: string,
    @Param('batchId') batchId: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<SendAiConversationMessageResult> {
    return this.conversationService.stopBatch(
      request.user.organizationId,
      request.user.userId,
      undefined,
      conversationId,
      batchId,
      idempotencyKey,
    )
  }

  @Post(':conversationId/batches/:batchId/retry')
  @HttpCode(200)
  retryFailedBatch(
    @Req() request: { user: { organizationId: string; userId: string } },
    @Param('conversationId') conversationId: string,
    @Param('batchId') batchId: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<SendAiConversationMessageResult> {
    return this.conversationService.retryFailedBatch(
      request.user.organizationId,
      request.user.userId,
      undefined,
      conversationId,
      batchId,
      idempotencyKey,
    )
  }
}

function parseAfterSequence(value?: string): number {
  if (value == null || value.trim() === '') {
    return 0
  }
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0
  }
  return Math.floor(parsed)
}
