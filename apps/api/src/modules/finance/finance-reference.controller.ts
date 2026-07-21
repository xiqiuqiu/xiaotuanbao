import { Controller, Get, Query, Req, UseGuards, BadRequestException } from '@nestjs/common'
import { RequireMenu } from '../../common/decorators/require-menu.decorator'
import { MenuPermissionGuard } from '../../common/guards/menu-permission.guard'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { DepartureFinanceFacade } from './departure-finance-facade.service'

/**
 * 参考/查找类接口（发团/合作伙伴/供应商/客源单选项，仅返回 id→名称，用于渲染
 * 筛选器与标签，非一等业务对象）。访问口径遵循「参考接口按其所返回实体类型的菜单
 * 单键守卫」这条房规（见 CONTEXT「Reference Options」与 ADR-0024）：能看见该类实体
 * 即可取其查找项，不用 OR、不用认证裸放。三个预设角色都持有这些业务菜单，故计调在
 * 「合作伙伴/供应商 → 往来账款」Tab 也能取发团名。声明式挂 @RequireMenu 使这些路由
 * 对权限矩阵 e2e 可见、受其硬断言守护，不再是命令式鉴权盲区。
 */
@Controller('finance')
@UseGuards(JwtAuthGuard, MenuPermissionGuard)
export class FinanceReferenceController {
  constructor(private readonly departureFinanceFacade: DepartureFinanceFacade) {}

  @Get('departure-options')
  @RequireMenu('/departure')
  async listDepartureOptions(
    @Req() request: { user: { organizationId: string } },
  ) {
    return this.departureFinanceFacade.listDepartureOptions(request.user.organizationId)
  }

  @Get('partner-options')
  @RequireMenu('/partner')
  async listPartnerOptions(
    @Req() request: { user: { organizationId: string } },
    @Query('departureId') departureId?: string,
  ) {
    return this.departureFinanceFacade.listPartnerOptions(
      request.user.organizationId,
      departureId?.trim() || undefined,
    )
  }

  @Get('supplier-options')
  @RequireMenu('/supplier')
  async listSupplierOptions(
    @Req() request: { user: { organizationId: string } },
    @Query('departureId') departureId?: string,
  ) {
    return this.departureFinanceFacade.listSupplierOptions(
      request.user.organizationId,
      departureId?.trim() || undefined,
    )
  }

  @Get('source-order-options')
  @RequireMenu('/departure')
  async listSourceOrderOptions(
    @Req() request: { user: { organizationId: string } },
    @Query('departureId') departureId?: string,
  ) {
    if (!departureId?.trim()) {
      throw new BadRequestException('请选择关联发团')
    }
    return this.departureFinanceFacade.listSourceOrderOptions(
      request.user.organizationId,
      departureId.trim(),
    )
  }
}
