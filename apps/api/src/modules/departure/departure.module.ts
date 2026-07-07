import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { DepartureController } from './departure.controller'
import { DepartureService } from './departure.service'
import { RouteTemplateController } from './route-template.controller'
import { RouteTemplateCopyService } from './route-template-copy.service'
import { RouteTemplateService } from './route-template.service'
import { SourceOrderController } from './source-order.controller'
import { SourceOrderService } from './source-order.service'

@Module({
  imports: [AuthModule],
  controllers: [DepartureController, RouteTemplateController, SourceOrderController],
  providers: [
    DepartureService,
    RouteTemplateService,
    RouteTemplateCopyService,
    SourceOrderService,
  ],
})
export class DepartureModule {}
