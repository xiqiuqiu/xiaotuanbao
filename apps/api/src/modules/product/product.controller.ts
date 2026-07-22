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
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common'
import type { Response } from 'express'
import type { ProductDetail, ProductListResult } from '@xiaotuanbao/shared'
import { RequireMenu } from '../../common/decorators/require-menu.decorator'
import { MenuPermissionGuard } from '../../common/guards/menu-permission.guard'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import {
  ApplyBookingNoticeTemplateDto,
  CreateProductDto,
  CreateProductScheduleDto,
  ListProductsQueryDto,
  PeerPackQueryDto,
  ProductSummaryExportQueryDto,
  ReplaceProductFeaturesDto,
  UpdateProductDto,
  UpdateProductScheduleDto,
  UpdateProductSpecDto,
} from './dto/product.dto'
import { buildOperationsSheetContentDisposition } from '../departure/departure-operations-sheet-excel.types'
import { ProductExportService } from './product-export.service'
import { ProductService } from './product.service'

@Controller('products')
@UseGuards(JwtAuthGuard, MenuPermissionGuard)
export class ProductController {
  constructor(
    private readonly productService: ProductService,
    private readonly productExportService: ProductExportService,
  ) {}

  @Get()
  @RequireMenu('/product')
  list(
    @Req() request: { user: { organizationId: string } },
    @Query() query: ListProductsQueryDto,
  ): Promise<ProductListResult> {
    return this.productService.list(request.user.organizationId, query)
  }

  /** 过渡总表 Excel：须在 `:id` 路由之前注册。财务只读角色亦可导出。 */
  @Get('summary.xlsx')
  @RequireMenu('/product')
  async downloadSummaryExcel(
    @Req() request: { user: { organizationId: string } },
    @Query() query: ProductSummaryExportQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.productExportService.buildSummaryExcel(
      request.user.organizationId,
      query,
    )
    res.setHeader('Content-Type', file.contentType)
    res.setHeader('Content-Disposition', buildOperationsSheetContentDisposition(file.filename))
    res.send(file.buffer)
  }

  @Post()
  @RequireMenu('product:write')
  create(
    @Req() request: { user: { organizationId: string } },
    @Body() dto: CreateProductDto,
  ): Promise<ProductDetail> {
    return this.productService.create(request.user.organizationId, dto)
  }

  @Get(':id/peer-pack.pdf')
  @RequireMenu('/product')
  async downloadPeerPackPdf(
    @Req() request: { user: { organizationId: string } },
    @Param('id') id: string,
    @Query() query: PeerPackQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    const priced = query.priced !== false
    const file = await this.productExportService.buildPeerPackPdf(
      request.user.organizationId,
      id,
      priced,
    )
    res.setHeader('Content-Type', file.contentType)
    res.setHeader('Content-Disposition', buildOperationsSheetContentDisposition(file.filename))
    res.send(file.buffer)
  }

  @Get(':id')
  @RequireMenu('/product')
  getById(
    @Req() request: { user: { organizationId: string } },
    @Param('id') id: string,
  ): Promise<ProductDetail> {
    return this.productService.getById(request.user.organizationId, id)
  }

  @Patch(':id')
  @RequireMenu('product:write')
  update(
    @Req() request: { user: { organizationId: string } },
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ): Promise<ProductDetail> {
    return this.productService.update(request.user.organizationId, id, dto)
  }

  @Put(':id/features')
  @RequireMenu('product:write')
  replaceFeatures(
    @Req() request: { user: { organizationId: string } },
    @Param('id') id: string,
    @Body() dto: ReplaceProductFeaturesDto,
  ): Promise<ProductDetail> {
    return this.productService.replaceFeatures(request.user.organizationId, id, dto)
  }

  @Post(':id/booking-notice/from-template')
  @RequireMenu('product:write')
  applyBookingNoticeTemplate(
    @Req() request: { user: { organizationId: string } },
    @Param('id') id: string,
    @Body() dto: ApplyBookingNoticeTemplateDto,
  ): Promise<ProductDetail> {
    return this.productService.applyBookingNoticeTemplate(
      request.user.organizationId,
      id,
      dto,
    )
  }

  @Delete(':id')
  @RequireMenu('product:write')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @Req() request: { user: { organizationId: string } },
    @Param('id') id: string,
  ): Promise<void> {
    await this.productService.delete(request.user.organizationId, id)
  }

  @Patch(':id/spec')
  @RequireMenu('product:write')
  updateSpec(
    @Req() request: { user: { organizationId: string } },
    @Param('id') id: string,
    @Body() dto: UpdateProductSpecDto,
  ): Promise<ProductDetail> {
    return this.productService.updateSpec(request.user.organizationId, id, dto)
  }

  @Post(':id/schedules')
  @RequireMenu('product:write')
  createSchedule(
    @Req() request: { user: { organizationId: string } },
    @Param('id') id: string,
    @Body() dto: CreateProductScheduleDto,
  ): Promise<ProductDetail> {
    return this.productService.createSchedule(request.user.organizationId, id, dto)
  }

  @Patch(':id/schedules/:scheduleId')
  @RequireMenu('product:write')
  updateSchedule(
    @Req() request: { user: { organizationId: string } },
    @Param('id') id: string,
    @Param('scheduleId') scheduleId: string,
    @Body() dto: UpdateProductScheduleDto,
  ): Promise<ProductDetail> {
    return this.productService.updateSchedule(
      request.user.organizationId,
      id,
      scheduleId,
      dto,
    )
  }
}
