import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common'
import type {
  GenerateDailySegmentsResult,
  ItinerarySegmentListResult,
  ItinerarySegmentSummary,
} from '@xiaotuanbao/shared'
import { RequireMenu } from '../../common/decorators/require-menu.decorator'
import { MenuPermissionGuard } from '../../common/guards/menu-permission.guard'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { GenerateDailySegmentsDto } from './dto/generate-daily-segments.dto'
import { CreateItinerarySegmentDto, UpdateItinerarySegmentDto } from './dto/segment.dto'
import { SegmentService } from './segment.service'

@Controller()
@UseGuards(JwtAuthGuard, MenuPermissionGuard)
export class SegmentController {
  constructor(private readonly segmentService: SegmentService) {}

  @Get('departures/:departureId/segments')
  @RequireMenu('/departure')
  listByDeparture(
    @Req() request: { user: { organizationId: string } },
    @Param('departureId') departureId: string,
  ): Promise<ItinerarySegmentListResult> {
    return this.segmentService.listByDeparture(request.user.organizationId, departureId)
  }

  @Post('departures/:departureId/segments/generate-daily')
  @RequireMenu('departure:write')
  generateDaily(
    @Req() request: { user: { organizationId: string } },
    @Param('departureId') departureId: string,
    @Body() dto: GenerateDailySegmentsDto,
  ): Promise<GenerateDailySegmentsResult> {
    return this.segmentService.generateDaily(request.user.organizationId, departureId, dto)
  }

  @Post('departures/:departureId/segments')
  @RequireMenu('departure:write')
  create(
    @Req() request: { user: { organizationId: string } },
    @Param('departureId') departureId: string,
    @Body() dto: CreateItinerarySegmentDto,
  ): Promise<ItinerarySegmentSummary> {
    return this.segmentService.create(request.user.organizationId, departureId, dto)
  }

  @Get('segments/:id')
  @RequireMenu('/departure')
  getById(
    @Req() request: { user: { organizationId: string } },
    @Param('id') id: string,
  ): Promise<ItinerarySegmentSummary> {
    return this.segmentService.getById(request.user.organizationId, id)
  }

  @Patch('segments/:id')
  @RequireMenu('departure:write')
  update(
    @Req() request: { user: { organizationId: string } },
    @Param('id') id: string,
    @Body() dto: UpdateItinerarySegmentDto,
  ): Promise<ItinerarySegmentSummary> {
    return this.segmentService.update(request.user.organizationId, id, dto)
  }

  @Delete('segments/:id')
  @RequireMenu('departure:write')
  async remove(
    @Req() request: { user: { organizationId: string } },
    @Param('id') id: string,
  ): Promise<{ success: true }> {
    await this.segmentService.remove(request.user.organizationId, id)
    return { success: true }
  }
}
