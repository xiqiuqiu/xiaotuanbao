import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common'
import type { DepartureListResult, DepartureSummary } from '@xiaotuanbao/shared'
import { RequireMenu } from '../../common/decorators/require-menu.decorator'
import { MenuPermissionGuard } from '../../common/guards/menu-permission.guard'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { CreateDepartureDto, ListDeparturesQueryDto } from './dto/departure.dto'
import { DepartureService } from './departure.service'

@Controller('departures')
@UseGuards(JwtAuthGuard, MenuPermissionGuard)
export class DepartureController {
  constructor(private readonly departureService: DepartureService) {}

  @Get()
  @RequireMenu('/departure')
  list(
    @Req() request: { user: { organizationId: string } },
    @Query() query: ListDeparturesQueryDto,
  ): Promise<DepartureListResult> {
    return this.departureService.list(request.user.organizationId, query)
  }

  @Post()
  @RequireMenu('/departure')
  create(
    @Req() request: { user: { organizationId: string } },
    @Body() dto: CreateDepartureDto,
  ): Promise<DepartureSummary> {
    return this.departureService.create(request.user.organizationId, dto)
  }
}
