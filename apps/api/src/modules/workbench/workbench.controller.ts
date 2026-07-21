import { Controller, Get, Req, UseGuards } from '@nestjs/common'
import type { WorkbenchSnapshot } from '@xiaotuanbao/shared'
import { RequireMenu } from '../../common/decorators/require-menu.decorator'
import { MenuPermissionGuard } from '../../common/guards/menu-permission.guard'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { WorkbenchService } from './workbench.service'

@Controller('workbench')
@UseGuards(JwtAuthGuard, MenuPermissionGuard)
export class WorkbenchController {
  constructor(private readonly workbenchService: WorkbenchService) {}

  @Get()
  @RequireMenu('/')
  getSnapshot(
    @Req() request: { user: { userId: string; organizationId: string } },
  ): Promise<WorkbenchSnapshot> {
    return this.workbenchService.getSnapshot(
      request.user.userId,
      request.user.organizationId,
    )
  }
}
