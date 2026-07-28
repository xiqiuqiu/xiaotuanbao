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
  DepartureResourceListResult,
  DepartureResourceSummary,
  GenerateDeparturePayableResult,
} from '@xiaotuanbao/shared'
import { RequireMenu } from '../../common/decorators/require-menu.decorator'
import { MenuPermissionGuard } from '../../common/guards/menu-permission.guard'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import {
  CreateDepartureResourceDto,
  ListDepartureResourcesQueryDto,
  UpdateDepartureResourceDto,
} from './dto/departure-resource.dto'
import { DepartureResourceService } from './departure-resource.service'

@Controller()
@UseGuards(JwtAuthGuard, MenuPermissionGuard)
export class DepartureResourceController {
  constructor(private readonly departureResourceService: DepartureResourceService) {}

  @Get('departures/:departureId/resources')
  @RequireMenu('/departure')
  listByDeparture(
    @Req() request: { user: { organizationId: string } },
    @Param('departureId') departureId: string,
    @Query() query: ListDepartureResourcesQueryDto,
  ): Promise<DepartureResourceListResult> {
    return this.departureResourceService.listByDeparture(
      request.user.organizationId,
      departureId,
      query,
    )
  }

  @Post('departures/:departureId/resources')
  @RequireMenu('departure:write')
  create(
    @Req() request: { user: { organizationId: string } },
    @Param('departureId') departureId: string,
    @Body() dto: CreateDepartureResourceDto,
  ): Promise<DepartureResourceSummary> {
    return this.departureResourceService.create(
      request.user.organizationId,
      departureId,
      dto,
    )
  }

  @Get('departure-resources/:id')
  @RequireMenu('/departure')
  getById(
    @Req() request: { user: { organizationId: string } },
    @Param('id') id: string,
  ): Promise<DepartureResourceSummary> {
    return this.departureResourceService.getById(request.user.organizationId, id)
  }

  @Patch('departure-resources/:id')
  @RequireMenu('departure:write')
  update(
    @Req() request: { user: { organizationId: string } },
    @Param('id') id: string,
    @Body() dto: UpdateDepartureResourceDto,
  ): Promise<DepartureResourceSummary> {
    return this.departureResourceService.update(request.user.organizationId, id, dto)
  }

  @Delete('departure-resources/:id')
  @RequireMenu('departure:write')
  async remove(
    @Req() request: { user: { organizationId: string } },
    @Param('id') id: string,
  ): Promise<{ success: true }> {
    await this.departureResourceService.remove(request.user.organizationId, id)
    return { success: true }
  }

  @Post('departure-resources/:id/generate-payable')
  @RequireMenu('/departure')
  generatePayable(
    @Req() request: { user: { organizationId: string } },
    @Param('id') id: string,
  ): Promise<GenerateDeparturePayableResult> {
    return this.departureResourceService.generatePayable(request.user.organizationId, id)
  }
}
