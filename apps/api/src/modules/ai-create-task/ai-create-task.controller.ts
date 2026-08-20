import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  MessageEvent,
  Param,
  Patch,
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
  AiCreateAssistAvailability,
  AiCreateAssistSession,
  AiCreateTaskSummary,
  DepartureMaterialView,
  DepartureSummary,
  SendAiConversationMessageResult,
} from '@xiaotuanbao/shared'
import type { Response } from 'express'
import { FilesInterceptor } from '@nestjs/platform-express'
import { memoryStorage } from 'multer'
import { Observable } from 'rxjs'
import { RequireMenu } from '../../common/decorators/require-menu.decorator'
import { SkipResponseWrap } from '../../common/decorators/skip-response-wrap.decorator'
import { MenuPermissionGuard } from '../../common/guards/menu-permission.guard'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { buildStoredObjectContentDisposition } from '../stored-object/stored-object.helpers'
import { AiConversationService } from './ai-conversation.service'
import { AiCreateTaskService } from './ai-create-task.service'
import { MATERIAL_MAX_BYTES, MATERIAL_MAX_FILES_PER_SEND } from './departure-material.constants'
import { DepartureMaterialService } from './departure-material.service'
import {
  ConfirmAiCreateTaskDto,
  ConfirmAiReviewPackageDto,
  PatchAiReviewPackageDto,
  RejectAiReviewPackageDto,
  RetryFailedMaterialsDto,
  RemoveBatchMaterialsDto,
  SaveDepartureCreationDraftDto,
  SendAiConversationMessageDto,
  SaveAiConversationTextDraftDto,
  CancelAiConversationInteractionDto,
  ListAiConversationEventsQueryDto,
  StartAiCreateAssistSessionDto,
} from './dto/ai-create-task.dto'

@Controller('ai-create-tasks')
@UseGuards(JwtAuthGuard, MenuPermissionGuard)
export class AiCreateTaskController {
  constructor(
    private readonly aiCreateTaskService: AiCreateTaskService,
    private readonly conversationService: AiConversationService,
    private readonly materialService: DepartureMaterialService,
  ) {}

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

  @Post(':taskId/conversations/:conversationId/messages')
  @HttpCode(201)
  @RequireMenu('departure:write')
  @UseInterceptors(
    FilesInterceptor('files', MATERIAL_MAX_FILES_PER_SEND, {
      storage: memoryStorage(),
      limits: {
        fileSize: MATERIAL_MAX_BYTES,
        files: MATERIAL_MAX_FILES_PER_SEND,
      },
    }),
  )
  sendConversationMessage(
    @Req() request: { user: { organizationId: string; userId: string } },
    @Param('taskId') taskId: string,
    @Param('conversationId') conversationId: string,
    @Body() dto: SendAiConversationMessageDto,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<SendAiConversationMessageResult> {
    return this.conversationService.sendText(
      request.user.organizationId,
      request.user.userId,
      taskId,
      conversationId,
      dto.text ?? '',
      idempotencyKey,
      (files ?? []).map((file) => ({
        originalname: file.originalname,
        mimetype: file.mimetype,
        buffer: file.buffer,
        size: file.size,
      })),
      {
        replyToEventId: dto.replyToEventId,
        interactionId: dto.interactionId,
        interactionVersion: dto.interactionVersion,
        selectedOptionId: dto.selectedOptionId,
      },
    )
  }

  @Put(':taskId/conversations/:conversationId/draft')
  @RequireMenu('departure:write')
  saveConversationDraft(
    @Req() request: { user: { organizationId: string; userId: string } },
    @Param('taskId') taskId: string,
    @Param('conversationId') conversationId: string,
    @Body() dto: SaveAiConversationTextDraftDto,
  ) {
    return this.conversationService.saveDraft(
      request.user.organizationId,
      request.user.userId,
      taskId,
      conversationId,
      dto.text,
      dto.draftEpoch,
    )
  }

  @Post(':taskId/conversations/:conversationId/interactions/:interactionId/cancel')
  @HttpCode(200)
  @RequireMenu('departure:write')
  cancelInteraction(
    @Req() request: { user: { organizationId: string; userId: string } },
    @Param('taskId') taskId: string,
    @Param('conversationId') conversationId: string,
    @Param('interactionId') interactionId: string,
    @Body() dto: CancelAiConversationInteractionDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<SendAiConversationMessageResult> {
    return this.conversationService.cancelInteraction(
      request.user.organizationId,
      request.user.userId,
      taskId,
      conversationId,
      interactionId,
      dto.version,
      idempotencyKey,
    )
  }

  @Post(':taskId/conversations/:conversationId/batches/:batchId/retry-failed-materials')
  @HttpCode(200)
  @RequireMenu('departure:write')
  retryFailedMaterials(
    @Req() request: { user: { organizationId: string; userId: string } },
    @Param('taskId') taskId: string,
    @Param('conversationId') conversationId: string,
    @Param('batchId') batchId: string,
    @Body() dto: RetryFailedMaterialsDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<SendAiConversationMessageResult> {
    return this.conversationService.retryFailedMaterials(
      request.user.organizationId,
      request.user.userId,
      taskId,
      conversationId,
      batchId,
      dto.materialIds,
      idempotencyKey,
    )
  }

  @Post(':taskId/conversations/:conversationId/batches/:batchId/remove-materials')
  @HttpCode(200)
  @RequireMenu('departure:write')
  removeBatchMaterials(
    @Req() request: { user: { organizationId: string; userId: string } },
    @Param('taskId') taskId: string,
    @Param('conversationId') conversationId: string,
    @Param('batchId') batchId: string,
    @Body() dto: RemoveBatchMaterialsDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<SendAiConversationMessageResult> {
    return this.conversationService.removeMaterials(
      request.user.organizationId,
      request.user.userId,
      taskId,
      conversationId,
      batchId,
      dto.materialIds,
      idempotencyKey,
    )
  }

  @Post(':taskId/conversations/:conversationId/batches/:batchId/abandon')
  @HttpCode(200)
  @RequireMenu('departure:write')
  abandonBatch(
    @Req() request: { user: { organizationId: string; userId: string } },
    @Param('taskId') taskId: string,
    @Param('conversationId') conversationId: string,
    @Param('batchId') batchId: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<SendAiConversationMessageResult> {
    return this.conversationService.abandonBatch(
      request.user.organizationId,
      request.user.userId,
      taskId,
      conversationId,
      batchId,
      idempotencyKey,
    )
  }

  @Post(':taskId/conversations/:conversationId/batches/:batchId/stop')
  @HttpCode(200)
  @RequireMenu('departure:write')
  stopBatch(
    @Req() request: { user: { organizationId: string; userId: string } },
    @Param('taskId') taskId: string,
    @Param('conversationId') conversationId: string,
    @Param('batchId') batchId: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<SendAiConversationMessageResult> {
    return this.conversationService.stopBatch(
      request.user.organizationId,
      request.user.userId,
      taskId,
      conversationId,
      batchId,
      idempotencyKey,
    )
  }

  @Post(':taskId/conversations/:conversationId/batches/:batchId/retry')
  @HttpCode(200)
  @RequireMenu('departure:write')
  retryFailedBatch(
    @Req() request: { user: { organizationId: string; userId: string } },
    @Param('taskId') taskId: string,
    @Param('conversationId') conversationId: string,
    @Param('batchId') batchId: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<SendAiConversationMessageResult> {
    return this.conversationService.retryFailedBatch(
      request.user.organizationId,
      request.user.userId,
      taskId,
      conversationId,
      batchId,
      idempotencyKey,
    )
  }

  @Get(':taskId/materials')
  @RequireMenu('departure:write')
  listMaterials(
    @Req() request: { user: { organizationId: string; userId: string } },
    @Param('taskId') taskId: string,
  ): Promise<DepartureMaterialView[]> {
    return this.materialService.list(request.user.organizationId, request.user.userId, taskId)
  }

  @Get(':taskId/assist-state')
  @RequireMenu('departure:write')
  getAssistTaskState(
    @Req() request: { user: { organizationId: string; userId: string } },
    @Param('taskId') taskId: string,
  ) {
    return this.conversationService.getTaskEntryState(
      request.user.organizationId,
      request.user.userId,
      taskId,
    )
  }

  @Get(':taskId/materials/:materialId/preview')
  @SkipResponseWrap()
  @RequireMenu('departure:write')
  async previewMaterial(
    @Req() request: { user: { organizationId: string; userId: string } },
    @Param('taskId') taskId: string,
    @Param('materialId') materialId: string,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.materialService.preview(
      request.user.organizationId,
      request.user.userId,
      taskId,
      materialId,
    )
    res.setHeader('Content-Type', file.contentType)
    res.setHeader(
      'Content-Disposition',
      buildStoredObjectContentDisposition(file.filename).replace(/^attachment/, 'inline'),
    )
    res.setHeader('Content-Length', String(file.buffer.byteLength))
    res.send(file.buffer)
  }

  @Get(':taskId/conversations/:conversationId/events')
  @RequireMenu('departure:write')
  listConversationEvents(
    @Req() request: { user: { organizationId: string; userId: string } },
    @Param('taskId') taskId: string,
    @Param('conversationId') conversationId: string,
    @Query() query: ListAiConversationEventsQueryDto,
  ) {
    return this.conversationService.listEvents(
      request.user.organizationId,
      request.user.userId,
      taskId,
      conversationId,
      query.afterSequence ?? 0,
    )
  }

  @Sse(':taskId/conversations/:conversationId/stream')
  @SkipResponseWrap()
  @RequireMenu('departure:write')
  streamConversationEvents(
    @Req() request: { user: { organizationId: string; userId: string } },
    @Param('taskId') taskId: string,
    @Param('conversationId') conversationId: string,
    @Query() query: ListAiConversationEventsQueryDto,
    @Headers('last-event-id') lastEventId?: string,
  ): Promise<Observable<MessageEvent>> {
    return this.conversationService.streamEvents(
      request.user.organizationId,
      request.user.userId,
      taskId,
      conversationId,
      Math.max(query.afterSequence ?? 0, parseAfterSequence(lastEventId)),
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
    @Body() dto: RejectAiReviewPackageDto,
  ): Promise<AiCreateTaskSummary> {
    return this.aiCreateTaskService.rejectReviewPackage(
      request.user.organizationId,
      request.user.userId,
      taskId,
      packageId,
      dto,
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
