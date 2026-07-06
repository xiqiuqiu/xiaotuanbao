import { Controller, Get, UseGuards } from '@nestjs/common'
import type { RoleSummary } from '@xiaotuanbao/shared'
import { RequireMenu } from '../../common/decorators/require-menu.decorator'
import { MenuPermissionGuard } from '../../common/guards/menu-permission.guard'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { RoleService } from './role.service'

@Controller('roles')
@UseGuards(JwtAuthGuard, MenuPermissionGuard)
export class RoleController {
  constructor(private readonly roleService: RoleService) {}

  @Get()
  @RequireMenu('/system/roles')
  findAll(): Promise<RoleSummary[]> {
    return this.roleService.findAll()
  }
}
