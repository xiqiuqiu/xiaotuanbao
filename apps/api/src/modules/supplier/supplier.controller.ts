import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common'
import type { SupplierListResult, SupplierSummary } from '@xiaotuanbao/shared'
import { RequireMenu } from '../../common/decorators/require-menu.decorator'
import { MenuPermissionGuard } from '../../common/guards/menu-permission.guard'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import {
  CreateSupplierDto,
  ListSuppliersQueryDto,
  UpdateSupplierDto,
} from './dto/supplier.dto'
import { SupplierService } from './supplier.service'

@Controller('suppliers')
@UseGuards(JwtAuthGuard, MenuPermissionGuard)
export class SupplierController {
  constructor(private readonly supplierService: SupplierService) {}

  @Get()
  @RequireMenu('/supplier')
  list(
    @Req() request: { user: { organizationId: string } },
    @Query() query: ListSuppliersQueryDto,
  ): Promise<SupplierListResult> {
    return this.supplierService.list(request.user.organizationId, query)
  }

  @Post()
  @RequireMenu('/supplier')
  create(
    @Req() request: { user: { organizationId: string } },
    @Body() dto: CreateSupplierDto,
  ): Promise<SupplierSummary> {
    return this.supplierService.create(request.user.organizationId, dto)
  }

  @Get(':id')
  @RequireMenu('/supplier')
  getById(
    @Req() request: { user: { organizationId: string } },
    @Param('id') id: string,
  ): Promise<SupplierSummary> {
    return this.supplierService.getById(request.user.organizationId, id)
  }

  @Patch(':id')
  @RequireMenu('/supplier')
  update(
    @Req() request: { user: { organizationId: string } },
    @Param('id') id: string,
    @Body() dto: UpdateSupplierDto,
  ): Promise<SupplierSummary> {
    return this.supplierService.update(request.user.organizationId, id, dto)
  }

  @Post(':id/archive')
  @RequireMenu('/supplier')
  archive(
    @Req() request: { user: { organizationId: string } },
    @Param('id') id: string,
  ): Promise<SupplierSummary> {
    return this.supplierService.archive(request.user.organizationId, id)
  }

  @Post(':id/restore')
  @RequireMenu('/supplier')
  restore(
    @Req() request: { user: { organizationId: string } },
    @Param('id') id: string,
  ): Promise<SupplierSummary> {
    return this.supplierService.restore(request.user.organizationId, id)
  }
}
