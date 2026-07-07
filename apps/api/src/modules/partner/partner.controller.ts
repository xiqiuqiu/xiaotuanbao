import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common'
import type { PartnerListResult, PartnerSummary } from '@xiaotuanbao/shared'
import { RequireMenu } from '../../common/decorators/require-menu.decorator'
import { MenuPermissionGuard } from '../../common/guards/menu-permission.guard'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { CreatePartnerDto, ListPartnersQueryDto } from './dto/partner.dto'
import { PartnerService } from './partner.service'

@Controller('partners')
@UseGuards(JwtAuthGuard, MenuPermissionGuard)
export class PartnerController {
  constructor(private readonly partnerService: PartnerService) {}

  @Get()
  @RequireMenu('/partner')
  list(
    @Req() request: { user: { organizationId: string } },
    @Query() query: ListPartnersQueryDto,
  ): Promise<PartnerListResult> {
    return this.partnerService.list(request.user.organizationId, query)
  }

  @Post()
  @RequireMenu('/partner')
  create(
    @Req() request: { user: { organizationId: string } },
    @Body() dto: CreatePartnerDto,
  ): Promise<PartnerSummary> {
    return this.partnerService.create(request.user.organizationId, dto)
  }

  @Get(':id')
  @RequireMenu('/partner')
  getById(
    @Req() request: { user: { organizationId: string } },
    @Param('id') id: string,
  ): Promise<PartnerSummary> {
    return this.partnerService.getById(request.user.organizationId, id)
  }
}
