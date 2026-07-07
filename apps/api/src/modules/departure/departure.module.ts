import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { FinanceModule } from '../finance/finance.module'
import { DepartureController } from './departure.controller'
import { DepartureService } from './departure.service'
import { RouteTemplateController } from './route-template.controller'
import { DepartureCopyService } from './departure-copy.service'
import { RouteTemplateCopyService } from './route-template-copy.service'
import { RouteTemplateService } from './route-template.service'
import { SourceOrderController } from './source-order.controller'
import { SourceOrderService } from './source-order.service'
import { SegmentController } from './segment.controller'
import { SegmentService } from './segment.service'
import { DepartureFinanceBridgeService } from './departure-finance-bridge.service'

@Module({
  imports: [AuthModule, FinanceModule],
  controllers: [
    DepartureController,
    RouteTemplateController,
    SourceOrderController,
    SegmentController,
  ],
  providers: [
    DepartureService,
    RouteTemplateService,
    RouteTemplateCopyService,
    DepartureCopyService,
    SourceOrderService,
    SegmentService,
    DepartureFinanceBridgeService,
  ],
})
export class DepartureModule {}
