import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common'
import type {
  FinanceVerificationListResult,
  PaymentScheduleListResult,
} from '@xiaotuanbao/shared'
import { PaymentScheduleDirection } from '@prisma/client'
import { RequireMenu } from '../../common/decorators/require-menu.decorator'
import { MenuPermissionGuard } from '../../common/guards/menu-permission.guard'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { ListPaymentSchedulesQueryDto } from '../finance/dto/payment-schedule.dto'
import { ListFinanceVerificationsQueryDto } from '../finance/dto/verification.dto'
import { PaymentScheduleService } from '../finance/payment-schedule.service'
import { VerificationService } from '../finance/verification.service'
import { DepartureService } from './departure.service'

@Controller()
@UseGuards(JwtAuthGuard, MenuPermissionGuard)
export class DepartureFinanceReadController {
  constructor(
    private readonly departureService: DepartureService,
    private readonly paymentScheduleService: PaymentScheduleService,
    private readonly verificationService: VerificationService,
  ) {}

  @Get('departures/:departureId/receivables')
  @RequireMenu('/departure')
  async listReceivables(
    @Req() request: { user: { organizationId: string } },
    @Param('departureId') departureId: string,
    @Query() query: ListPaymentSchedulesQueryDto,
  ): Promise<PaymentScheduleListResult> {
    await this.departureService.getById(request.user.organizationId, departureId)
    return this.paymentScheduleService.list(
      request.user.organizationId,
      PaymentScheduleDirection.receivable,
      { ...query, departureId },
    )
  }

  @Get('departures/:departureId/payables')
  @RequireMenu('/departure')
  async listPayables(
    @Req() request: { user: { organizationId: string } },
    @Param('departureId') departureId: string,
    @Query() query: ListPaymentSchedulesQueryDto,
  ): Promise<PaymentScheduleListResult> {
    await this.departureService.getById(request.user.organizationId, departureId)
    return this.paymentScheduleService.list(
      request.user.organizationId,
      PaymentScheduleDirection.payable,
      { ...query, departureId },
    )
  }

  @Get('departures/:departureId/verifications')
  @RequireMenu('/departure')
  async listVerifications(
    @Req() request: { user: { organizationId: string } },
    @Param('departureId') departureId: string,
    @Query() query: ListFinanceVerificationsQueryDto,
  ): Promise<FinanceVerificationListResult> {
    await this.departureService.getById(request.user.organizationId, departureId)
    return this.verificationService.list(request.user.organizationId, {
      ...query,
      departureId,
    })
  }
}
