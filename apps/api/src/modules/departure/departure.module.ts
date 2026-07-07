import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { FinanceModule } from '../finance/finance.module'
import { DepartureController } from './departure.controller'
import { DepartureService } from './departure.service'
import { DepartureReadModelService } from './departure-read-model.service'
import { RouteTemplateController } from './route-template.controller'
import { DepartureCopyService } from './departure-copy.service'
import { RouteTemplateCopyService } from './route-template-copy.service'
import { RouteTemplateService } from './route-template.service'
import { SourceOrderController } from './source-order.controller'
import { SourceOrderService } from './source-order.service'
import { SegmentController } from './segment.controller'
import { SegmentService } from './segment.service'
import { SegmentResourceController } from './segment-resource.controller'
import { SegmentResourceService } from './segment-resource.service'
import { DepartureFinanceBridgeService } from './departure-finance-bridge.service'
import { DepartureFinanceReadController } from './departure-finance-read.controller'

@Module({
  imports: [AuthModule, FinanceModule],
  controllers: [
    DepartureController,
    DepartureFinanceReadController,
    RouteTemplateController,
    SourceOrderController,
    SegmentController,
    SegmentResourceController,
  ],
  providers: [
    DepartureService,
    DepartureReadModelService,
    RouteTemplateService,
    RouteTemplateCopyService,
    DepartureCopyService,
    SourceOrderService,
    SegmentService,
    SegmentResourceService,
    DepartureFinanceBridgeService,
  ],
})
export class DepartureModule {}
