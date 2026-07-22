import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import type {
  ProductImportConfirmResult,
  ProductImportSessionDetail,
} from '@xiaotuanbao/shared'
import { memoryStorage } from 'multer'
import { RequireMenu } from '../../common/decorators/require-menu.decorator'
import { MenuPermissionGuard } from '../../common/guards/menu-permission.guard'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { STORED_OBJECT_MAX_UPLOAD_BYTES } from '../stored-object/stored-object.constants'
import { ConfirmProductImportSessionDto } from './dto/product-import.dto'
import { ProductImportService } from './product-import.service'

@Controller('products/import-sessions')
@UseGuards(JwtAuthGuard, MenuPermissionGuard)
export class ProductImportController {
  constructor(private readonly productImportService: ProductImportService) {}

  @Post()
  @HttpCode(201)
  @RequireMenu('product:write')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: {
        fileSize: STORED_OBJECT_MAX_UPLOAD_BYTES,
        files: 1,
      },
    }),
  )
  create(
    @Req() request: { user: { userId: string; organizationId: string } },
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<ProductImportSessionDetail> {
    return this.productImportService.createSession(
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
  @RequireMenu('/product')
  getById(
    @Req() request: { user: { organizationId: string } },
    @Param('id') id: string,
  ): Promise<ProductImportSessionDetail> {
    return this.productImportService.getSession(request.user.organizationId, id)
  }

  @Post(':id/confirm')
  @RequireMenu('product:write')
  confirm(
    @Req() request: { user: { organizationId: string } },
    @Param('id') id: string,
    @Body() dto: ConfirmProductImportSessionDto,
  ): Promise<ProductImportConfirmResult> {
    return this.productImportService.confirmSession(request.user.organizationId, id, dto)
  }
}
