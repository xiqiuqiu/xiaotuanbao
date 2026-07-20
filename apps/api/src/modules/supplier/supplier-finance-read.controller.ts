import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common'
import type {
  PaymentScheduleAggregateResult,
  PaymentScheduleListResult,
} from '@xiaotuanbao/shared'
import { CounterpartyType, PaymentScheduleDirection } from '@prisma/client'
import { RequireMenu } from '../../common/decorators/require-menu.decorator'
import { MenuPermissionGuard } from '../../common/guards/menu-permission.guard'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import {
  ListPaymentSchedulesQueryDto,
  PaymentScheduleAggregateQueryDto,
} from '../finance/dto/payment-schedule.dto'
import { PaymentScheduleService } from '../finance/payment-schedule.service'
import { SupplierService } from './supplier.service'

/**
 * 往来账款 Tab（财务账款层）：按 counterpartyType=supplier + counterpartyId
 * 精确过滤的应付节点列表，镜像 Partner 版端点、走 /supplier 菜单权限。
 * 供应商结构上只有应付，故本控制器不提供应收端点（供应商退款是收入流水
 * 而非应收节点，极罕见的手工「供应商应收」只在全局应收页可见）。
 */
@Controller()
@UseGuards(JwtAuthGuard, MenuPermissionGuard)
export class SupplierFinanceReadController {
  constructor(
    private readonly supplierService: SupplierService,
    private readonly paymentScheduleService: PaymentScheduleService,
  ) {}

  @Get('suppliers/:supplierId/payables')
  @RequireMenu('/supplier')
  async listPayables(
    @Req() request: { user: { organizationId: string } },
    @Param('supplierId') supplierId: string,
    @Query() query: ListPaymentSchedulesQueryDto,
  ): Promise<PaymentScheduleListResult> {
    await this.supplierService.getById(request.user.organizationId, supplierId)
    return this.paymentScheduleService.list(
      request.user.organizationId,
      PaymentScheduleDirection.payable,
      {
        ...query,
        counterpartyType: CounterpartyType.supplier,
        counterpartyId: supplierId,
      },
    )
  }

  /**
   * 账款聚合：direction × sourceType 分组的约定/已核销/未结清合计，
   * 支撑往来账款 Tab 汇总卡（应付约定/已核销/未结清三项）。
   * 已关闭、已作废节点不计入；出团日期区间与列表同口径。
   */
  @Get('suppliers/:supplierId/payment-schedule-summary')
  @RequireMenu('/supplier')
  async paymentScheduleSummary(
    @Req() request: { user: { organizationId: string } },
    @Param('supplierId') supplierId: string,
    @Query() query: PaymentScheduleAggregateQueryDto,
  ): Promise<PaymentScheduleAggregateResult> {
    await this.supplierService.getById(request.user.organizationId, supplierId)
    return this.paymentScheduleService.aggregateByCounterparty(
      request.user.organizationId,
      {
        counterpartyType: CounterpartyType.supplier,
        counterpartyId: supplierId,
        departureDateFrom: query.departureDateFrom,
        departureDateTo: query.departureDateTo,
      },
    )
  }
}
