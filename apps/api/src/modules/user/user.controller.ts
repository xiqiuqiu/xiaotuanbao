import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common'
import type { EmployeeListResult, EmployeeSummary } from '@xiaotuanbao/shared'
import { RequireMenu } from '../../common/decorators/require-menu.decorator'
import { MenuPermissionGuard } from '../../common/guards/menu-permission.guard'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { CreateEmployeeDto, ListEmployeesQueryDto, UpdateEmployeeDto } from './dto/employee.dto'
import { UserService } from './user.service'

@Controller('users')
@UseGuards(JwtAuthGuard, MenuPermissionGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  @RequireMenu('/system/users')
  list(
    @Req() request: { user: { organizationId: string } },
    @Query() query: ListEmployeesQueryDto,
  ): Promise<EmployeeListResult> {
    return this.userService.list(request.user.organizationId, query)
  }

  /** Lightweight owner/assignee options for departure UI (ADR-0016: no /system/users needed). */
  @Get('options')
  @RequireMenu('/departure')
  listOptions(
    @Req() request: { user: { organizationId: string } },
  ): Promise<Array<{ id: string; name: string }>> {
    return this.userService.listOptions(request.user.organizationId)
  }

  @Post()
  @RequireMenu('/system/users')
  create(
    @Req() request: { user: { organizationId: string } },
    @Body() dto: CreateEmployeeDto,
  ): Promise<EmployeeSummary> {
    return this.userService.create(request.user.organizationId, dto)
  }

  @Patch(':id')
  @RequireMenu('/system/users')
  update(
    @Req() request: { user: { organizationId: string } },
    @Param('id') id: string,
    @Body() dto: UpdateEmployeeDto,
  ): Promise<EmployeeSummary> {
    return this.userService.update(request.user.organizationId, id, dto)
  }

  @Post(':id/disable')
  @RequireMenu('/system/users')
  disable(
    @Req() request: { user: { organizationId: string } },
    @Param('id') id: string,
  ): Promise<EmployeeSummary> {
    return this.userService.disable(request.user.organizationId, id)
  }
}
