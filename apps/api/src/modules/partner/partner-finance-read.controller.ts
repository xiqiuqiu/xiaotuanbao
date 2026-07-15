import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common'
import type { PaymentScheduleListResult } from '@xiaotuanbao/shared'
import { CounterpartyType, PaymentScheduleDirection } from '@prisma/client'
import { RequireMenu } from '../../common/decorators/require-menu.decorator'
import { MenuPermissionGuard } from '../../common/guards/menu-permission.guard'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { ListPaymentSchedulesQueryDto } from '../finance/dto/payment-schedule.dto'
import { PaymentScheduleService } from '../finance/payment-schedule.service'
import { PartnerService } from './partner.service'

/**
 * 往来账款 Tab（财务账款层）：按 counterpartyType=partner + counterpartyId
 * 精确过滤的应收/应付节点列表，镜像发团版端点、走 /partner 菜单权限。
 * 游客代收节点（counterparty=guest）天然被精确过滤排除。
 */
@Controller()
@UseGuards(JwtAuthGuard, MenuPermissionGuard)
export class PartnerFinanceReadController {
  constructor(
    private readonly partnerService: PartnerService,
    private readonly paymentScheduleService: PaymentScheduleService,
  ) {}

  @Get('partners/:partnerId/receivables')
  @RequireMenu('/partner')
  async listReceivables(
    @Req() request: { user: { organizationId: string } },
    @Param('partnerId') partnerId: string,
    @Query() query: ListPaymentSchedulesQueryDto,
  ): Promise<PaymentScheduleListResult> {
    await this.partnerService.getById(request.user.organizationId, partnerId)
    return this.paymentScheduleService.list(
      request.user.organizationId,
      PaymentScheduleDirection.receivable,
      {
        ...query,
        counterpartyType: CounterpartyType.partner,
        counterpartyId: partnerId,
      },
    )
  }

  @Get('partners/:partnerId/payables')
  @RequireMenu('/partner')
  async listPayables(
    @Req() request: { user: { organizationId: string } },
    @Param('partnerId') partnerId: string,
    @Query() query: ListPaymentSchedulesQueryDto,
  ): Promise<PaymentScheduleListResult> {
    await this.partnerService.getById(request.user.organizationId, partnerId)
    return this.paymentScheduleService.list(
      request.user.organizationId,
      PaymentScheduleDirection.payable,
      {
        ...query,
        counterpartyType: CounterpartyType.partner,
        counterpartyId: partnerId,
      },
    )
  }
}
