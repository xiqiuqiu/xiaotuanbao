import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common'
import type { BookingNoticeTemplateSummary } from '@xiaotuanbao/shared'
import { RequireMenu } from '../../common/decorators/require-menu.decorator'
import { MenuPermissionGuard } from '../../common/guards/menu-permission.guard'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { BookingNoticeTemplateService } from './booking-notice-template.service'
import {
  CreateBookingNoticeTemplateDto,
  UpdateBookingNoticeTemplateDto,
} from './dto/product.dto'

@Controller('booking-notice-templates')
@UseGuards(JwtAuthGuard, MenuPermissionGuard)
export class BookingNoticeTemplateController {
  constructor(private readonly templateService: BookingNoticeTemplateService) {}

  @Get()
  @RequireMenu('/product')
  list(
    @Req() request: { user: { organizationId: string } },
  ): Promise<BookingNoticeTemplateSummary[]> {
    return this.templateService.list(request.user.organizationId)
  }

  @Get(':id')
  @RequireMenu('/product')
  getById(
    @Req() request: { user: { organizationId: string } },
    @Param('id') id: string,
  ): Promise<BookingNoticeTemplateSummary> {
    return this.templateService.getById(request.user.organizationId, id)
  }

  @Post()
  @RequireMenu('/system/organization')
  create(
    @Req() request: { user: { organizationId: string } },
    @Body() dto: CreateBookingNoticeTemplateDto,
  ): Promise<BookingNoticeTemplateSummary> {
    return this.templateService.create(request.user.organizationId, dto)
  }

  @Patch(':id')
  @RequireMenu('/system/organization')
  update(
    @Req() request: { user: { organizationId: string } },
    @Param('id') id: string,
    @Body() dto: UpdateBookingNoticeTemplateDto,
  ): Promise<BookingNoticeTemplateSummary> {
    return this.templateService.update(request.user.organizationId, id, dto)
  }

  @Delete(':id')
  @RequireMenu('/system/organization')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @Req() request: { user: { organizationId: string } },
    @Param('id') id: string,
  ): Promise<void> {
    await this.templateService.delete(request.user.organizationId, id)
  }
}
