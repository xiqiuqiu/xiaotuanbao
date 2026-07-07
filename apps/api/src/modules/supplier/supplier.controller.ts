import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common'
import type { SupplierListResult, SupplierSummary } from '@xiaotuanbao/shared'
import { RequireMenu } from '../../common/decorators/require-menu.decorator'
import { MenuPermissionGuard } from '../../common/guards/menu-permission.guard'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { CreateSupplierDto, ListSuppliersQueryDto } from './dto/supplier.dto'
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
}
