import { Controller, Get, Req, UseGuards } from '@nestjs/common'
import type { OrganizationSummary } from '@xiaotuanbao/shared'
import { RequireMenu } from '../../common/decorators/require-menu.decorator'
import { MenuPermissionGuard } from '../../common/guards/menu-permission.guard'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { OrganizationService } from './organization.service'

@Controller('organization')
@UseGuards(JwtAuthGuard, MenuPermissionGuard)
export class OrganizationController {
  constructor(private readonly organizationService: OrganizationService) {}

  @Get()
  @RequireMenu('/system/organization')
  getCurrent(@Req() request: { user: { organizationId: string } }): Promise<OrganizationSummary> {
    return this.organizationService.getCurrent(request.user.organizationId)
  }
}
