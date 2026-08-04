import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common'
import type {
  PlatformOrganizationDetail,
  PlatformOrganizationListResult,
  PlatformOrganizationProfile,
} from '@xiaotuanbao/shared'
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { CreatePlatformOrganizationDto } from './dto/create-platform-organization.dto'
import { ListPlatformOrganizationsQueryDto } from './dto/list-platform-organizations.dto'
import { UpdatePlatformOrganizationBusinessPrefixDto } from './dto/update-platform-organization-business-prefix.dto'
import { UpdatePlatformOrganizationDto } from './dto/update-platform-organization.dto'
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

  @Post('organizations')
  createOrganization(
    @Body() dto: CreatePlatformOrganizationDto,
  ): Promise<PlatformOrganizationProfile> {
    return this.platformOrganizationsService.create(dto)
  }

  @Get('organizations/:id')
  getOrganization(@Param('id') id: string): Promise<PlatformOrganizationDetail> {
    return this.platformOrganizationsService.getById(id)
  }

  @Patch('organizations/:id')
  updateOrganization(
    @Param('id') id: string,
    @Body() dto: UpdatePlatformOrganizationDto,
  ): Promise<PlatformOrganizationProfile> {
    return this.platformOrganizationsService.updateName(id, dto)
  }

  @Patch('organizations/:id/business-prefix')
  updateOrganizationBusinessPrefix(
    @Param('id') id: string,
    @Body() dto: UpdatePlatformOrganizationBusinessPrefixDto,
  ): Promise<PlatformOrganizationProfile> {
    return this.platformOrganizationsService.updateBusinessPrefix(id, dto.businessPrefix)
  }

  @Post('organizations/:id/disable')
  disableOrganization(@Param('id') id: string): Promise<PlatformOrganizationProfile> {
    return this.platformOrganizationsService.disable(id)
  }

  @Post('organizations/:id/enable')
  enableOrganization(@Param('id') id: string): Promise<PlatformOrganizationProfile> {
    return this.platformOrganizationsService.enable(id)
  }
}
