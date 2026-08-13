import { Module, forwardRef } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { DepartureModule } from '../departure/departure.module'
import { AiCreateTaskController } from './ai-create-task.controller'
import { AiCreateTaskService } from './ai-create-task.service'

@Module({
  imports: [AuthModule, forwardRef(() => DepartureModule)],
  controllers: [AiCreateTaskController],
  providers: [AiCreateTaskService],
  exports: [AiCreateTaskService],
})
export class AiCreateTaskModule {}
