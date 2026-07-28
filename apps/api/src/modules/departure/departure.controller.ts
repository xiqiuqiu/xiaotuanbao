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
  Res,
  UseGuards,
} from '@nestjs/common'
import type {
  DepartureDetail,
  DepartureListResult,
  DepartureOperationsSheetSnapshot,
  DepartureRouteNamesResult,
  DepartureSummary,
  GroundIncomeListResult,
  GroundIncomeSummary,
  RouteLedgerResult,
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
  ListRouteLedgerQueryDto,
  TransitionDepartureDto,
  UnarchiveDepartureDto,
  UpdateDepartureDto,
} from './dto/departure.dto'
import { DepartureService } from './departure.service'
import { DepartureOperationsSheetService } from './departure-operations-sheet.service'
import { buildOperationsSheetContentDisposition } from './departure-operations-sheet-excel.types'
import {
  CreateGroundIncomeDto,
  UpdateGroundIncomeDto,
} from './dto/ground-income.dto'
import { GroundIncomeService } from './ground-income.service'

@Controller('departures')
@UseGuards(JwtAuthGuard, MenuPermissionGuard)
export class DepartureController {
  constructor(
    private readonly departureService: DepartureService,
    private readonly operationsSheetService: DepartureOperationsSheetService,
    private readonly groundIncomeService: GroundIncomeService,
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

  @Get('route-names')
  @RequireMenu('/departure')
  listRouteNames(
    @Req() request: { user: { organizationId: string } },
  ): Promise<DepartureRouteNamesResult> {
    return this.departureService.listRouteNames(request.user.organizationId)
  }

  @Get('route-ledger')
  @RequireMenu('/departure')
  getRouteLedger(
    @Req() request: { user: { organizationId: string } },
    @Query() query: ListRouteLedgerQueryDto,
  ): Promise<RouteLedgerResult> {
    return this.departureService.getRouteLedger(request.user.organizationId, query)
  }

  @Post()
  @RequireMenu('departure:write')
  create(
    @Req() request: { user: { organizationId: string } },
    @Body() dto: CreateDepartureDto,
  ): Promise<DepartureSummary> {
    return this.departureService.create(request.user.organizationId, dto)
  }

  @Post(':id/copy')
  @RequireMenu('departure:write')
  copy(
    @Req() request: { user: { organizationId: string } },
    @Param('id') id: string,
    @Body() dto: CopyDepartureDto,
  ): Promise<DepartureSummary> {
    return this.departureService.copy(request.user.organizationId, id, dto)
  }

  @Get(':id/ground-incomes')
  @RequireMenu('/departure')
  listGroundIncomes(
    @Req() request: { user: { organizationId: string } },
    @Param('id') id: string,
  ): Promise<GroundIncomeListResult> {
    return this.groundIncomeService.list(request.user.organizationId, id)
  }

  @Post(':id/ground-incomes')
  @RequireMenu('departure:write')
  createGroundIncome(
    @Req() request: { user: { organizationId: string } },
    @Param('id') id: string,
    @Body() dto: CreateGroundIncomeDto,
  ): Promise<GroundIncomeSummary> {
    return this.groundIncomeService.create(request.user.organizationId, id, dto)
  }

  @Patch(':id/ground-incomes/:groundIncomeId')
  @RequireMenu('departure:write')
  updateGroundIncome(
    @Req() request: { user: { organizationId: string } },
    @Param('id') id: string,
    @Param('groundIncomeId') groundIncomeId: string,
    @Body() dto: UpdateGroundIncomeDto,
  ): Promise<GroundIncomeSummary> {
    return this.groundIncomeService.update(
      request.user.organizationId,
      id,
      groundIncomeId,
      dto,
    )
  }

  @Delete(':id/ground-incomes/:groundIncomeId')
  @RequireMenu('departure:write')
  async deleteGroundIncome(
    @Req() request: { user: { organizationId: string } },
    @Param('id') id: string,
    @Param('groundIncomeId') groundIncomeId: string,
  ): Promise<{ success: true }> {
    await this.groundIncomeService.delete(
      request.user.organizationId,
      id,
      groundIncomeId,
    )
    return { success: true }
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
  @RequireMenu('departure:write')
  update(
    @Req() request: { user: { organizationId: string } },
    @Param('id') id: string,
    @Body() dto: UpdateDepartureDto,
  ): Promise<DepartureDetail> {
    return this.departureService.update(request.user.organizationId, id, dto)
  }

  @Delete(':id')
  @RequireMenu('departure:write')
  async purge(
    @Req() request: { user: { organizationId: string } },
    @Param('id') id: string,
  ): Promise<{ success: true }> {
    await this.departureService.purge(request.user.organizationId, id)
    return { success: true }
  }

  @Post(':id/transition')
  @RequireMenu('departure:write')
  transition(
    @Req() request: { user: { organizationId: string } },
    @Param('id') id: string,
    @Body() dto: TransitionDepartureDto,
  ): Promise<DepartureDetail> {
    return this.departureService.transition(request.user.organizationId, id, dto)
  }

  @Post(':id/close')
  @RequireMenu('departure:write')
  close(
    @Req() request: { user: { organizationId: string; userId: string } },
    @Param('id') id: string,
    @Body() dto: CloseDepartureDto,
  ): Promise<DepartureDetail> {
    return this.departureService.close(request.user.organizationId, id, request.user.userId, dto)
  }

  @Post(':id/unarchive')
  @RequireMenu('departure:write')
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
