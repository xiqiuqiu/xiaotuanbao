import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common'
import type {
  BatchFinanceGenerationResult,
  GeneratePayableResult,
  PartnerOutsourceOrderListResult,
  SegmentResourceListResult,
  SegmentResourceSummary,
  SupplierServiceOrderListResult,
} from '@xiaotuanbao/shared'
import { RequireMenu } from '../../common/decorators/require-menu.decorator'
import { MenuPermissionGuard } from '../../common/guards/menu-permission.guard'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import {
  CreateSegmentResourceDto,
  ListSegmentResourcesQueryDto,
  ListSupplierServiceOrdersQueryDto,
  UpdateSegmentResourceDto,
} from './dto/segment-resource.dto'
import { SegmentResourceService } from './segment-resource.service'

@Controller()
@UseGuards(JwtAuthGuard, MenuPermissionGuard)
export class SegmentResourceController {
  constructor(private readonly segmentResourceService: SegmentResourceService) {}

  @Get('segments/:segmentId/resources')
  @RequireMenu('/departure')
  listBySegment(
    @Req() request: { user: { organizationId: string } },
    @Param('segmentId') segmentId: string,
    @Query() query: ListSegmentResourcesQueryDto,
  ): Promise<SegmentResourceListResult> {
    return this.segmentResourceService.listBySegment(
      request.user.organizationId,
      segmentId,
      query,
    )
  }

  /** 供应商服务团单 Tab：按 Supplier 跨发团查询非拼出资源行（业务事实层）。 */
  @Get('suppliers/:supplierId/service-orders')
  @RequireMenu('/supplier')
  listBySupplier(
    @Req() request: { user: { organizationId: string } },
    @Param('supplierId') supplierId: string,
    @Query() query: ListSupplierServiceOrdersQueryDto,
  ): Promise<SupplierServiceOrderListResult> {
    return this.segmentResourceService.listBySupplier(
      request.user.organizationId,
      supplierId,
      query,
    )
  }

  /** 合作团单·拼出分段：按 Partner 跨发团查询拼出资源行（业务事实层）。 */
  @Get('partners/:partnerId/outsource-orders')
  @RequireMenu('/partner')
  listOutsourceByPartner(
    @Req() request: { user: { organizationId: string } },
    @Param('partnerId') partnerId: string,
    @Query() query: ListSupplierServiceOrdersQueryDto,
  ): Promise<PartnerOutsourceOrderListResult> {
    return this.segmentResourceService.listOutsourceByPartner(
      request.user.organizationId,
      partnerId,
      query,
    )
  }

  @Post('segments/:segmentId/resources')
  @RequireMenu('departure:write')
  create(
    @Req() request: { user: { organizationId: string } },
    @Param('segmentId') segmentId: string,
    @Body() dto: CreateSegmentResourceDto,
  ): Promise<SegmentResourceSummary> {
    return this.segmentResourceService.create(request.user.organizationId, segmentId, dto)
  }

  @Get('segment-resources/:id')
  @RequireMenu('/departure')
  getById(
    @Req() request: { user: { organizationId: string } },
    @Param('id') id: string,
  ): Promise<SegmentResourceSummary> {
    return this.segmentResourceService.getById(request.user.organizationId, id)
  }

  @Patch('segment-resources/:id')
  @RequireMenu('departure:write')
  update(
    @Req() request: { user: { organizationId: string } },
    @Param('id') id: string,
    @Body() dto: UpdateSegmentResourceDto,
  ): Promise<SegmentResourceSummary> {
    return this.segmentResourceService.update(request.user.organizationId, id, dto)
  }

  @Delete('segment-resources/:id')
  @RequireMenu('departure:write')
  async remove(
    @Req() request: { user: { organizationId: string } },
    @Param('id') id: string,
  ): Promise<{ success: true }> {
    await this.segmentResourceService.remove(request.user.organizationId, id)
    return { success: true }
  }

  @Post('segments/:id/generate-payables')
  @RequireMenu('/departure')
  generatePayablesForSegment(
    @Req() request: { user: { organizationId: string } },
    @Param('id') id: string,
  ): Promise<BatchFinanceGenerationResult> {
    return this.segmentResourceService.generatePayablesForSegment(
      request.user.organizationId,
      id,
    )
  }

  @Post('segment-resources/:id/generate-payable')
  @RequireMenu('/departure')
  generatePayable(
    @Req() request: { user: { organizationId: string } },
    @Param('id') id: string,
  ): Promise<GeneratePayableResult> {
    return this.segmentResourceService.generatePayable(request.user.organizationId, id)
  }
}
