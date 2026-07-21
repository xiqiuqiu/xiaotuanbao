import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { WorkbenchController } from './workbench.controller'
import { WorkbenchService } from './workbench.service'
import { CoordinatorWorkbenchService } from './coordinator-workbench.service'
import { DepartureModule } from '../departure/departure.module'
import { FinanceModule } from '../finance/finance.module'
import { CoordinatorSettlementWorkbenchService } from './coordinator-settlement-workbench.service'
import { CoordinatorTrendWorkbenchService } from './coordinator-trend-workbench.service'
import { OrganizationScaleWorkbenchService } from './organization-scale-workbench.service'
import { FinanceReceivablesWorkbenchService } from './finance-receivables-workbench.service'
import { FinanceFundsWorkbenchService } from './finance-funds-workbench.service'

@Module({
  imports: [AuthModule, DepartureModule, FinanceModule],
  controllers: [WorkbenchController],
  providers: [
    WorkbenchService,
    CoordinatorWorkbenchService,
    CoordinatorSettlementWorkbenchService,
    CoordinatorTrendWorkbenchService,
    OrganizationScaleWorkbenchService,
    FinanceReceivablesWorkbenchService,
    FinanceFundsWorkbenchService,
  ],
})
export class WorkbenchModule {}
