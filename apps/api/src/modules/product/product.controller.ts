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
  Query,
  Req,
  UseGuards,
} from '@nestjs/common'
import type { ProductDetail, ProductListResult } from '@xiaotuanbao/shared'
import { RequireMenu } from '../../common/decorators/require-menu.decorator'
import { MenuPermissionGuard } from '../../common/guards/menu-permission.guard'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import {
  CreateProductDto,
  CreateProductScheduleDto,
  ListProductsQueryDto,
  UpdateProductDto,
  UpdateProductScheduleDto,
  UpdateProductSpecDto,
} from './dto/product.dto'
import { ProductService } from './product.service'

@Controller('products')
@UseGuards(JwtAuthGuard, MenuPermissionGuard)
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @Get()
  @RequireMenu('/product')
  list(
    @Req() request: { user: { organizationId: string } },
    @Query() query: ListProductsQueryDto,
  ): Promise<ProductListResult> {
    return this.productService.list(request.user.organizationId, query)
  }

  @Post()
  @RequireMenu('product:write')
  create(
    @Req() request: { user: { organizationId: string } },
    @Body() dto: CreateProductDto,
  ): Promise<ProductDetail> {
    return this.productService.create(request.user.organizationId, dto)
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
