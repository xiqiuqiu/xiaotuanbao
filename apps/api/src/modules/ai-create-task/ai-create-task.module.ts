import { Module, forwardRef } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { DepartureModule } from '../departure/departure.module'
import { AiCreateTaskController } from './ai-create-task.controller'
import { AiCreateTaskService } from './ai-create-task.service'
import { AiToolController } from './ai-tool.controller'
import { AgentServiceIdentityGuard } from './agent-service-identity.guard'
import { AiOperationDelegationGuard } from './ai-operation-delegation.guard'

@Module({
  imports: [AuthModule, forwardRef(() => DepartureModule)],
  controllers: [AiCreateTaskController, AiToolController],
  providers: [AiCreateTaskService, AgentServiceIdentityGuard, AiOperationDelegationGuard],
  exports: [AiCreateTaskService],
})
export class AiCreateTaskModule {}
