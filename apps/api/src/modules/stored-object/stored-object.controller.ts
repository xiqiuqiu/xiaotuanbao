import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import type { StoredObjectSummary } from '@xiaotuanbao/shared'
import type { Response } from 'express'
import { memoryStorage } from 'multer'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { StoredObjectIdParam } from './dto/stored-object-id.param'
import { STORED_OBJECT_MAX_UPLOAD_BYTES } from './stored-object.constants'
import { buildStoredObjectContentDisposition } from './stored-object.helpers'
import { StoredObjectService } from './stored-object.service'

/**
 * Platform FileStore / StoredObject API (ADR-0027 / #156).
 * AuthZ: any authenticated org member (JWT). No product-center menu key yet —
 * intentionally listed on the permission-matrix mutating allowlist.
 */
@Controller('stored-objects')
@UseGuards(JwtAuthGuard)
export class StoredObjectController {
  constructor(private readonly storedObjectService: StoredObjectService) {}

  @Post()
  @HttpCode(201)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: {
        fileSize: STORED_OBJECT_MAX_UPLOAD_BYTES,
        files: 1,
      },
    }),
  )
  upload(
    @Req() request: { user: { userId: string; organizationId: string } },
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<StoredObjectSummary> {
    return this.storedObjectService.upload(
      request.user.organizationId,
      request.user.userId,
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

  @Get(':id')
  async download(
    @Req() request: { user: { organizationId: string } },
    @Param() params: StoredObjectIdParam,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.storedObjectService.download(request.user.organizationId, params.id)
    res.setHeader('Content-Type', file.contentType)
    res.setHeader('Content-Disposition', buildStoredObjectContentDisposition(file.filename))
    res.setHeader('Content-Length', String(file.buffer.byteLength))
    res.send(file.buffer)
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @Req() request: { user: { organizationId: string } },
    @Param() params: StoredObjectIdParam,
  ): Promise<void> {
    await this.storedObjectService.delete(request.user.organizationId, params.id)
  }
}
