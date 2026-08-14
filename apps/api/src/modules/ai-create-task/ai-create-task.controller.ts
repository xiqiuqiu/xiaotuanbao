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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import type {
  AiCreateAssistAvailability,
  AiCreateAssistSession,
  AiCreateTaskSummary,
  DepartureMaterialView,
  DepartureSummary,
} from '@xiaotuanbao/shared'
import type { Response } from 'express'
import { memoryStorage } from 'multer'
import { RequireMenu } from '../../common/decorators/require-menu.decorator'
import { MenuPermissionGuard } from '../../common/guards/menu-permission.guard'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { buildStoredObjectContentDisposition } from '../stored-object/stored-object.helpers'
import { AiCreateTaskService } from './ai-create-task.service'
import { DepartureMaterialService } from './departure-material.service'
import {
  ConfirmAiCreateTaskDto,
  ConfirmAiReviewPackageDto,
  PatchAiReviewPackageDto,
  SaveDepartureCreationDraftDto,
  StartAiCreateAssistSessionDto,
} from './dto/ai-create-task.dto'

const MATERIAL_MAX_UPLOAD_BYTES = 20 * 1024 * 1024

@Controller('ai-create-tasks')
@UseGuards(JwtAuthGuard, MenuPermissionGuard)
export class AiCreateTaskController {
  constructor(
    private readonly aiCreateTaskService: AiCreateTaskService,
    private readonly departureMaterialService: DepartureMaterialService,
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

  @Post(':taskId/materials')
  @HttpCode(201)
  @RequireMenu('departure:write')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: {
        fileSize: MATERIAL_MAX_UPLOAD_BYTES,
        files: 1,
      },
    }),
  )
  uploadMaterial(
    @Req() request: { user: { organizationId: string; userId: string } },
    @Param('taskId') taskId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<DepartureMaterialView> {
    return this.departureMaterialService.upload(
      request.user.organizationId,
      request.user.userId,
      taskId,
      file
        ? {
            originalname: file.originalname,
            mimetype: file.mimetype,
            buffer: file.buffer,
            size: file.size,
          }
        : undefined,
    )
  }

  @Get(':taskId/materials')
  @RequireMenu('departure:write')
  listMaterials(
    @Req() request: { user: { organizationId: string; userId: string } },
    @Param('taskId') taskId: string,
  ): Promise<DepartureMaterialView[]> {
    return this.departureMaterialService.list(
      request.user.organizationId,
      request.user.userId,
      taskId,
    )
  }

  @Get(':taskId/materials/:materialId/preview')
  @RequireMenu('departure:write')
  async previewMaterial(
    @Req() request: { user: { organizationId: string; userId: string } },
    @Param('taskId') taskId: string,
    @Param('materialId') materialId: string,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.departureMaterialService.preview(
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
