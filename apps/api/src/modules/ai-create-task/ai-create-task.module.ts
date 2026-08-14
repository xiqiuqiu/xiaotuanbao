import { Module, forwardRef } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { DepartureModule } from '../departure/departure.module'
import { StoredObjectModule } from '../stored-object/stored-object.module'
import { AiConversationEventHub } from './ai-conversation-event.hub'
import { AiConversationService } from './ai-conversation.service'
import { AiCreateTaskController } from './ai-create-task.controller'
import { AiCreateTaskService } from './ai-create-task.service'
import { AiHeadlessClient } from './ai-headless.client'
import { AiToolController } from './ai-tool.controller'
import { AiWorkflowProcessor } from './ai-workflow.processor'
import { AgentServiceIdentityGuard } from './agent-service-identity.guard'
import { AiOperationDelegationGuard } from './ai-operation-delegation.guard'
import { DepartureMaterialService } from './departure-material.service'
import { ParseWorkerClient } from './parse-worker.client'

@Module({
  imports: [AuthModule, forwardRef(() => DepartureModule), StoredObjectModule],
  controllers: [AiCreateTaskController, AiToolController],
  providers: [
    AiCreateTaskService,
    AiConversationService,
    AiConversationEventHub,
    AiHeadlessClient,
    AiWorkflowProcessor,
    AgentServiceIdentityGuard,
    AiOperationDelegationGuard,
    DepartureMaterialService,
    ParseWorkerClient,
  ],
  exports: [AiCreateTaskService, AiWorkflowProcessor],
})
export class AiCreateTaskModule {}
