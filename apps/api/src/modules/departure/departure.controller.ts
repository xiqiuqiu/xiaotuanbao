import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common'
import type {
  DepartureDetail,
  DepartureListResult,
  DepartureOperationsSheetSnapshot,
  DepartureSummary,
} from '@xiaotuanbao/shared'
import type { Response } from 'express'
import { RequireMenu } from '../../common/decorators/require-menu.decorator'
import { MenuPermissionGuard } from '../../common/guards/menu-permission.guard'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import {
  CreateDepartureDto,
  CopyDepartureDto,
  CloseDepartureDto,
  ListDeparturesQueryDto,
  TransitionDepartureDto,
  UnarchiveDepartureDto,
  UpdateDepartureDto,
} from './dto/departure.dto'
import { DepartureService } from './departure.service'
import { DepartureOperationsSheetService } from './departure-operations-sheet.service'
import { buildOperationsSheetContentDisposition } from './departure-operations-sheet-excel.types'

@Controller('departures')
@UseGuards(JwtAuthGuard, MenuPermissionGuard)
export class DepartureController {
  constructor(
    private readonly departureService: DepartureService,
    private readonly operationsSheetService: DepartureOperationsSheetService,
  ) {}

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

  @Get(':id/operations-sheet')
  @RequireMenu('/departure')
  getOperationsSheet(
    @Req() request: { user: { organizationId: string; userId: string } },
    @Param('id') id: string,
  ): Promise<DepartureOperationsSheetSnapshot> {
    return this.operationsSheetService.buildSnapshot(
      request.user.organizationId,
      id,
      request.user.userId,
    )
  }

  @Get(':id/operations-sheet.xlsx')
  @RequireMenu('/departure')
  async downloadOperationsSheet(
    @Req() request: { user: { organizationId: string; userId: string } },
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.operationsSheetService.buildWorkbook(
      request.user.organizationId,
      id,
      request.user.userId,
    )
    res.setHeader('Content-Type', file.contentType)
    res.setHeader('Content-Disposition', buildOperationsSheetContentDisposition(file.filename))
    res.send(file.buffer)
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
    @Req() request: { user: { organizationId: string; userId: string } },
    @Param('id') id: string,
    @Body() dto: CloseDepartureDto,
  ): Promise<DepartureDetail> {
    return this.departureService.close(request.user.organizationId, id, request.user.userId, dto)
  }

  @Post(':id/unarchive')
  @RequireMenu('/departure')
  unarchive(
    @Req() request: { user: { organizationId: string; userId: string } },
    @Param('id') id: string,
    @Body() dto: UnarchiveDepartureDto,
  ): Promise<DepartureDetail> {
    return this.departureService.unarchive(
      request.user.organizationId,
      id,
      request.user.userId,
      dto,
    )
  }
}
