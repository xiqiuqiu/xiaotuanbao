import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common'
import type {
  PlatformOrganizationListResult,
  PlatformOrganizationProfile,
} from '@xiaotuanbao/shared'
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { ListPlatformOrganizationsQueryDto } from './dto/list-platform-organizations.dto'
import { PlatformOrganizationsService } from './platform-organizations.service'

@Controller('platform')
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
export class PlatformController {
  constructor(private readonly platformOrganizationsService: PlatformOrganizationsService) {}

  @Get('session')
  getSession(@Req() request: { user: { isPlatformAdmin: boolean } }) {
    return {
      ok: true as const,
      isPlatformAdmin: request.user.isPlatformAdmin,
    }
  }

  @Get('organizations')
  listOrganizations(
    @Query() query: ListPlatformOrganizationsQueryDto,
  ): Promise<PlatformOrganizationListResult> {
    return this.platformOrganizationsService.list(query)
  }

  @Get('organizations/:id')
  getOrganization(@Param('id') id: string): Promise<PlatformOrganizationProfile> {
    return this.platformOrganizationsService.getById(id)
  }
}
