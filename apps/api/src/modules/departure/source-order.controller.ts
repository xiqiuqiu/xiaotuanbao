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
  GenerateReceivablesResult,
  GuestCollectionChangeImpact,
  PartnerSourceOrderListResult,
  PendingReceivableSourceOrderListResult,
  SourceOrderGuestSummary,
  SourceOrderListResult,
  SourceOrderSummary,
} from '@xiaotuanbao/shared'
import { RequireMenu } from '../../common/decorators/require-menu.decorator'
import { MenuPermissionGuard } from '../../common/guards/menu-permission.guard'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import {
  CreateSourceOrderDto,
  CreateSourceOrderGuestDto,
  ListPartnerSourceOrdersQueryDto,
  ListPendingReceivableSourceOrdersQueryDto,
  ListSourceOrdersQueryDto,
  UpdateSourceOrderDto,
  UpdateSourceOrderGuestDto,
} from './dto/source-order.dto'
import { SourceOrderService } from './source-order.service'
import { SourceOrderReceivableGapService } from './source-order-receivable-gap.service'

@Controller()
@UseGuards(JwtAuthGuard, MenuPermissionGuard)
export class SourceOrderController {
  constructor(
    private readonly sourceOrderService: SourceOrderService,
    private readonly sourceOrderReceivableGapService: SourceOrderReceivableGapService,
  ) {}

  @Get('source-orders')
  @RequireMenu('/departure')
  listPendingReceivables(
    @Req() request: { user: { organizationId: string } },
    @Query() query: ListPendingReceivableSourceOrdersQueryDto,
  ): Promise<PendingReceivableSourceOrderListResult> {
    return this.sourceOrderReceivableGapService.listPending(
      request.user.organizationId,
      query.page,
      query.pageSize,
    )
  }

  @Get('departures/:departureId/source-orders')
  @RequireMenu('/departure')
  listByDeparture(
    @Req() request: { user: { organizationId: string } },
    @Param('departureId') departureId: string,
    @Query() query: ListSourceOrdersQueryDto,
  ): Promise<SourceOrderListResult> {
    return this.sourceOrderService.listByDeparture(
      request.user.organizationId,
      departureId,
      query,
    )
  }

  /** 合作团单·客源分段：按 Partner 跨发团查询客源单（业务事实层）。 */
  @Get('partners/:partnerId/source-orders')
  @RequireMenu('/partner')
  listByPartner(
    @Req() request: { user: { organizationId: string } },
    @Param('partnerId') partnerId: string,
    @Query() query: ListPartnerSourceOrdersQueryDto,
  ): Promise<PartnerSourceOrderListResult> {
    return this.sourceOrderService.listByPartner(
      request.user.organizationId,
      partnerId,
      query,
    )
  }

  @Post('departures/:departureId/source-orders')
  @RequireMenu('departure:write')
  create(
    @Req() request: { user: { organizationId: string } },
    @Param('departureId') departureId: string,
    @Body() dto: CreateSourceOrderDto,
  ): Promise<SourceOrderSummary> {
    return this.sourceOrderService.create(request.user.organizationId, departureId, dto)
  }

  @Get('source-orders/:id')
  @RequireMenu('/departure')
  getById(
    @Req() request: { user: { organizationId: string } },
    @Param('id') id: string,
  ): Promise<SourceOrderSummary> {
    return this.sourceOrderService.getById(request.user.organizationId, id)
  }

  @Get('source-orders/:id/guest-collection-change-impact')
  @RequireMenu('/departure')
  guestCollectionChangeImpact(
    @Req() request: { user: { organizationId: string } },
    @Param('id') id: string,
  ): Promise<GuestCollectionChangeImpact> {
    return this.sourceOrderService.getGuestCollectionChangeImpact(
      request.user.organizationId,
      id,
    )
  }

  @Patch('source-orders/:id')
  @RequireMenu('departure:write')
  update(
    @Req() request: { user: { organizationId: string } },
    @Param('id') id: string,
    @Body() dto: UpdateSourceOrderDto,
  ): Promise<SourceOrderSummary> {
    return this.sourceOrderService.update(request.user.organizationId, id, dto)
  }

  @Delete('source-orders/:id')
  @RequireMenu('departure:write')
  async remove(
    @Req() request: { user: { organizationId: string } },
    @Param('id') id: string,
  ): Promise<{ success: true }> {
    await this.sourceOrderService.remove(request.user.organizationId, id)
    return { success: true }
  }

  @Get('source-orders/:id/guests')
  @RequireMenu('/departure')
  listGuests(
    @Req() request: { user: { organizationId: string } },
    @Param('id') id: string,
  ): Promise<SourceOrderGuestSummary[]> {
    return this.sourceOrderService.listGuests(request.user.organizationId, id)
  }

  @Post('source-orders/:id/guests')
  @RequireMenu('departure:write')
  createGuest(
    @Req() request: { user: { organizationId: string } },
    @Param('id') id: string,
    @Body() dto: CreateSourceOrderGuestDto,
  ): Promise<SourceOrderGuestSummary> {
    return this.sourceOrderService.createGuest(request.user.organizationId, id, dto)
  }

  @Patch('source-orders/:id/guests/:guestId')
  @RequireMenu('departure:write')
  updateGuest(
    @Req() request: { user: { organizationId: string } },
    @Param('id') id: string,
    @Param('guestId') guestId: string,
    @Body() dto: UpdateSourceOrderGuestDto,
  ): Promise<SourceOrderGuestSummary> {
    return this.sourceOrderService.updateGuest(
      request.user.organizationId,
      id,
      guestId,
      dto,
    )
  }

  @Delete('source-orders/:id/guests/:guestId')
  @RequireMenu('departure:write')
  async removeGuest(
    @Req() request: { user: { organizationId: string } },
    @Param('id') id: string,
    @Param('guestId') guestId: string,
  ): Promise<{ success: true }> {
    await this.sourceOrderService.removeGuest(request.user.organizationId, id, guestId)
    return { success: true }
  }

  @Post('departures/:departureId/generate-receivables')
  @RequireMenu('/departure')
  generateReceivablesForDeparture(
    @Req() request: { user: { organizationId: string } },
    @Param('departureId') departureId: string,
  ): Promise<BatchFinanceGenerationResult> {
    return this.sourceOrderService.generateReceivablesForDeparture(
      request.user.organizationId,
      departureId,
    )
  }

  @Post('source-orders/:id/generate-receivables')
  @RequireMenu('/departure')
  generateReceivables(
    @Req() request: { user: { organizationId: string } },
    @Param('id') id: string,
  ): Promise<GenerateReceivablesResult> {
    return this.sourceOrderService.generateReceivables(request.user.organizationId, id)
  }
}
