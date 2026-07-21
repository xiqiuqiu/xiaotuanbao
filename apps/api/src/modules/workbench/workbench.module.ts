import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { WorkbenchController } from './workbench.controller'
import { WorkbenchService } from './workbench.service'
import { CoordinatorWorkbenchService } from './coordinator-workbench.service'
import { DepartureModule } from '../departure/departure.module'
import { CoordinatorSettlementWorkbenchService } from './coordinator-settlement-workbench.service'
import { CoordinatorTrendWorkbenchService } from './coordinator-trend-workbench.service'

@Module({
  imports: [AuthModule, DepartureModule],
  controllers: [WorkbenchController],
  providers: [
    WorkbenchService,
    CoordinatorWorkbenchService,
    CoordinatorSettlementWorkbenchService,
    CoordinatorTrendWorkbenchService,
  ],
})
export class WorkbenchModule {}
