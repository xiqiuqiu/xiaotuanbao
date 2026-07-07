import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { DepartureController } from './departure.controller'
import { DepartureService } from './departure.service'
import { RouteTemplateController } from './route-template.controller'
import { RouteTemplateCopyService } from './route-template-copy.service'
import { RouteTemplateService } from './route-template.service'

@Module({
  imports: [AuthModule],
  controllers: [DepartureController, RouteTemplateController],
  providers: [DepartureService, RouteTemplateService, RouteTemplateCopyService],
})
export class DepartureModule {}
