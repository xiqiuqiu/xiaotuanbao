import { Controller, ForbiddenException, Get, Query, Req, UseGuards, BadRequestException } from '@nestjs/common'
import { AuthService } from '../auth/auth.service'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { DepartureFinanceFacade } from './departure-finance-facade.service'

const FINANCE_MENU_KEYS = [
  '/finance/receivable',
  '/finance/payable',
  '/finance/transactions',
  '/finance/verification',
] as const

@Controller('finance')
@UseGuards(JwtAuthGuard)
export class FinanceReferenceController {
  constructor(
    private readonly authService: AuthService,
    private readonly departureFinanceFacade: DepartureFinanceFacade,
  ) {}

  @Get('departure-options')
  async listDepartureOptions(
    @Req() request: { user: { organizationId: string; userId: string } },
  ) {
    // 计调在「合作伙伴/供应商 → 往来账款」Tab 也要用发团名，且持有 /departure，故放行。
    await this.assertReferenceAccess(request.user.userId, '/departure')
    return this.departureFinanceFacade.listDepartureOptions(request.user.organizationId)
  }

  @Get('partner-options')
  async listPartnerOptions(
    @Req() request: { user: { organizationId: string; userId: string } },
  ) {
    await this.assertReferenceAccess(request.user.userId, '/partner')
    return this.departureFinanceFacade.listPartnerOptions(request.user.organizationId)
  }

  @Get('supplier-options')
  async listSupplierOptions(
    @Req() request: { user: { organizationId: string; userId: string } },
  ) {
    await this.assertReferenceAccess(request.user.userId, '/supplier')
    return this.departureFinanceFacade.listSupplierOptions(request.user.organizationId)
  }

  @Get('source-order-options')
  async listSourceOrderOptions(
    @Req() request: { user: { organizationId: string; userId: string } },
    @Query('departureId') departureId?: string,
  ) {
    await this.assertReferenceAccess(request.user.userId, '/departure')
    if (!departureId?.trim()) {
      throw new BadRequestException('请选择关联发团')
    }
    return this.departureFinanceFacade.listSourceOrderOptions(
      request.user.organizationId,
      departureId.trim(),
    )
  }

  /**
   * 参考数据（发团/合作伙伴/供应商/客源单选项）的访问口径：只要能看见该类实体
   * （持有对应业务菜单 `businessMenuKey`），或持有任一 /finance/* 菜单，即可获取。
   *
   * 这些接口以命令式校验（非 @RequireMenu），因为需要「业务菜单 OR 财务菜单」的或语义，
   * 单键的 MenuPermissionGuard 表达不了。注意：权限矩阵 e2e 只能看见声明式守卫，
   * 故此处口径改动须由本控制器自身的单测守护（finance-reference.controller.spec.ts）。
   */
  private async assertReferenceAccess(
    userId: string,
    businessMenuKey: string,
  ): Promise<void> {
    const menuKeys = await this.authService.getMenuKeysForUser(userId)
    const allowedKeys = [businessMenuKey, ...FINANCE_MENU_KEYS]
    if (!allowedKeys.some((menuKey) => menuKeys.includes(menuKey))) {
      throw new ForbiddenException('无权访问')
    }
  }
}
