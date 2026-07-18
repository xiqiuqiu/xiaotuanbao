import { Body, Controller, Delete, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common'
import { RequireMenu } from '../../common/decorators/require-menu.decorator'
import { MenuPermissionGuard } from '../../common/guards/menu-permission.guard'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import {
  CreateRouteTemplateDto,
  CreateRouteTemplateFromDepartureDto,
  ListRouteTemplatesQueryDto,
} from './dto/route-template.dto'
import { DepartureCopyService } from './departure-copy.service'
import {
  RouteTemplateDetailSummary,
  RouteTemplateService,
  type RouteTemplateCardSummary,
} from './route-template.service'

@Controller('route-templates')
@UseGuards(JwtAuthGuard, MenuPermissionGuard)
export class RouteTemplateController {
  constructor(
    private readonly routeTemplateService: RouteTemplateService,
    private readonly departureCopyService: DepartureCopyService,
  ) {}

  @Get()
  @RequireMenu('/departure')
  list(
    @Req() request: { user: { organizationId: string } },
    @Query() query: ListRouteTemplatesQueryDto,
  ): Promise<RouteTemplateCardSummary[]> {
    return this.routeTemplateService.list(request.user.organizationId, query.keyword)
  }

  @Post('from-departure/:departureId')
  @RequireMenu('departure:write')
  createFromDeparture(
    @Req() request: { user: { organizationId: string } },
    @Param('departureId') departureId: string,
    @Body() dto: CreateRouteTemplateFromDepartureDto,
  ): Promise<RouteTemplateDetailSummary> {
    return this.departureCopyService.copyToTemplate(
      request.user.organizationId,
      departureId,
      dto,
    )
  }

  @Get(':id')
  @RequireMenu('/departure')
  getById(
    @Req() request: { user: { organizationId: string } },
    @Param('id') id: string,
  ): Promise<RouteTemplateDetailSummary> {
    return this.routeTemplateService.getById(request.user.organizationId, id)
  }

  @Post()
  @RequireMenu('departure:write')
  create(
    @Req() request: { user: { organizationId: string } },
    @Body() dto: CreateRouteTemplateDto,
  ): Promise<RouteTemplateDetailSummary> {
    return this.routeTemplateService.create(request.user.organizationId, dto)
  }

  @Delete(':id')
  @RequireMenu('departure:write')
  async remove(
    @Req() request: { user: { organizationId: string } },
    @Param('id') id: string,
  ): Promise<{ success: true }> {
    await this.routeTemplateService.remove(request.user.organizationId, id)
    return { success: true }
  }
}
