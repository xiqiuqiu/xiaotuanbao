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
import type {
  DepartureDetail,
  DepartureListResult,
  DepartureSummary,
} from '@xiaotuanbao/shared'
import { RequireMenu } from '../../common/decorators/require-menu.decorator'
import { MenuPermissionGuard } from '../../common/guards/menu-permission.guard'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import {
  CreateDepartureDto,
  CopyDepartureDto,
  ListDeparturesQueryDto,
  TransitionDepartureDto,
  UpdateDepartureDto,
} from './dto/departure.dto'
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

  @Get('next-no')
  @RequireMenu('/departure')
  previewNextNo(
    @Req() request: { user: { organizationId: string } },
  ): Promise<{ departureNo: string }> {
    return this.departureService.previewNextDepartureNo(request.user.organizationId)
  }

  @Post()
  @RequireMenu('/departure')
  create(
    @Req() request: { user: { organizationId: string } },
    @Body() dto: CreateDepartureDto,
  ): Promise<DepartureSummary> {
    return this.departureService.create(request.user.organizationId, dto)
  }

  @Post(':id/copy')
  @RequireMenu('/departure')
  copy(
    @Req() request: { user: { organizationId: string } },
    @Param('id') id: string,
    @Body() dto: CopyDepartureDto,
  ): Promise<DepartureSummary> {
    return this.departureService.copy(request.user.organizationId, id, dto)
  }

  @Get(':id')
  @RequireMenu('/departure')
  getById(
    @Req() request: { user: { organizationId: string } },
    @Param('id') id: string,
  ): Promise<DepartureDetail> {
    return this.departureService.getById(request.user.organizationId, id)
  }

  @Patch(':id')
  @RequireMenu('/departure')
  update(
    @Req() request: { user: { organizationId: string } },
    @Param('id') id: string,
    @Body() dto: UpdateDepartureDto,
  ): Promise<DepartureDetail> {
    return this.departureService.update(request.user.organizationId, id, dto)
  }

  @Post(':id/transition')
  @RequireMenu('/departure')
  transition(
    @Req() request: { user: { organizationId: string } },
    @Param('id') id: string,
    @Body() dto: TransitionDepartureDto,
  ): Promise<DepartureDetail> {
    return this.departureService.transition(request.user.organizationId, id, dto)
  }

  @Post(':id/close')
  @RequireMenu('/departure')
  close(
    @Req() request: { user: { organizationId: string } },
    @Param('id') id: string,
  ): Promise<DepartureDetail> {
    return this.departureService.close(request.user.organizationId, id)
  }
}
