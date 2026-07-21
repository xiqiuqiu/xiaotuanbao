import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { WorkbenchController } from './workbench.controller'
import { WorkbenchService } from './workbench.service'

@Module({
  imports: [AuthModule],
  controllers: [WorkbenchController],
  providers: [WorkbenchService],
})
export class WorkbenchModule {}
