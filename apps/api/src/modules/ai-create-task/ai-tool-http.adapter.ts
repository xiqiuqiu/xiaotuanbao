import { Injectable } from '@nestjs/common'
import type {
  GetMaterialParseResultOutput,
  GetTaskContextOutput,
  SearchRouteTemplatesOutput,
} from '@xiaotuanbao/ai-contracts'
import { AiActionGateway } from '../ai-action/ai-action.gateway'
import type { AiActionActor } from '../ai-action/ai-action.types'
import { AiCollaborationHttpException } from './ai-collaboration.http-exception'
import { AiCreateTaskService } from './ai-create-task.service'
import type { AiToolRequestUser } from './ai-operation-delegation.guard'

@Injectable()
export class AiToolHttpAdapter {
  constructor(
    private readonly gateway: AiActionGateway,
    private readonly tasks: AiCreateTaskService,
  ) {}

  getTaskContext(user: AiToolRequestUser, body: unknown): Promise<GetTaskContextOutput> {
    return this.executeRead('getTaskContext', user, body, () =>
      this.tasks.getTaskContextForAgent(user, body),
    )
  }

  searchRouteTemplates(
    user: AiToolRequestUser,
    body: unknown,
  ): Promise<SearchRouteTemplatesOutput> {
    return this.executeRead('searchRouteTemplates', user, body, () =>
      this.tasks.searchRouteTemplatesForAgent(user, body),
    )
  }

  getMaterialParseResult(
    user: AiToolRequestUser,
    body: unknown,
  ): Promise<GetMaterialParseResultOutput> {
    return this.executeRead('getMaterialParseResult', user, body, () =>
      this.tasks.getMaterialParseResultForAgent(user, body),
    )
  }

  private async executeRead<T>(
    name: 'getTaskContext' | 'searchRouteTemplates' | 'getMaterialParseResult',
    user: AiToolRequestUser,
    body: unknown,
    forward: () => Promise<T>,
  ): Promise<T> {
    const executed = await this.gateway.execute({
      name,
      actor: actorFrom(user),
      input: body,
      forward,
    })
    if (executed.result !== undefined) {
      return executed.result as T
    }
    throw AiCollaborationHttpException.fromCode('DELEGATION_INVALID')
  }
}

function actorFrom(user: AiToolRequestUser): AiActionActor {
  return {
    organizationId: user.organizationId,
    userId: user.userId,
    taskId: user.taskId,
    conversationId: user.conversationId,
    inputBatchId: user.inputBatchId,
    runId: user.runId,
    attemptId: user.attemptId,
    contextManifestId: user.contextManifestId,
  }
}
