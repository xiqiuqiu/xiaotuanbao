import { Injectable } from '@nestjs/common'
import type { GetTaskContextOutput } from '@xiaotuanbao/ai-contracts'
import { AiActionGateway } from '../ai-action/ai-action.gateway'
import { AiCollaborationHttpException } from './ai-collaboration.http-exception'
import { AiCreateTaskService } from './ai-create-task.service'
import type { AiToolRequestUser } from './ai-operation-delegation.guard'

@Injectable()
export class AiToolHttpAdapter {
  constructor(
    private readonly gateway: AiActionGateway,
    private readonly tasks: AiCreateTaskService,
  ) {}

  async getTaskContext(user: AiToolRequestUser, body: unknown): Promise<GetTaskContextOutput> {
    const executed = await this.gateway.execute({
      name: 'getTaskContext',
      actor: {
        organizationId: user.organizationId,
        userId: user.userId,
        taskId: user.taskId,
        conversationId: user.conversationId,
        inputBatchId: user.inputBatchId,
        runId: user.runId,
        attemptId: user.attemptId,
        contextManifestId: user.contextManifestId,
      },
      input: body,
      forward: () => this.tasks.getTaskContextForAgent(user, body),
    })
    if (executed.result !== undefined) {
      return executed.result as GetTaskContextOutput
    }
    throw AiCollaborationHttpException.fromCode('DELEGATION_INVALID')
  }
}
