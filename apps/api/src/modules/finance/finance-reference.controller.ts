import { Controller, ForbiddenException, Get, Req, UseGuards } from '@nestjs/common'
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
    await this.assertFinanceAccess(request.user.userId)
    return this.departureFinanceFacade.listDepartureOptions(request.user.organizationId)
  }

  @Get('partner-options')
  async listPartnerOptions(
    @Req() request: { user: { organizationId: string; userId: string } },
  ) {
    await this.assertFinanceAccess(request.user.userId)
    return this.departureFinanceFacade.listPartnerOptions(request.user.organizationId)
  }

  @Get('supplier-options')
  async listSupplierOptions(
    @Req() request: { user: { organizationId: string; userId: string } },
  ) {
    await this.assertFinanceAccess(request.user.userId)
    return this.departureFinanceFacade.listSupplierOptions(request.user.organizationId)
  }

  private async assertFinanceAccess(userId: string): Promise<void> {
    const menuKeys = await this.authService.getMenuKeysForUser(userId)
    if (!FINANCE_MENU_KEYS.some((menuKey) => menuKeys.includes(menuKey))) {
      throw new ForbiddenException('无权访问')
    }
  }
}
