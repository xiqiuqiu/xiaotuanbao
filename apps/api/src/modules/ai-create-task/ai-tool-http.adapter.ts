import { Injectable } from '@nestjs/common'
import type {
  GetMaterialParseResultOutput,
  GetTaskContextOutput,
  SearchRouteTemplatesOutput,
  SubmitReviewPackageOutput,
} from '@xiaotuanbao/ai-contracts'
import { AiActionGateway } from '../ai-action/ai-action.gateway'
import type { AiActionActor, AiActionForwardContext } from '../ai-action/ai-action.types'
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
    return this.executeRegistered('getTaskContext', user, body, () =>
      this.tasks.getTaskContextForAgent(user, body),
    )
  }

  searchRouteTemplates(
    user: AiToolRequestUser,
    body: unknown,
  ): Promise<SearchRouteTemplatesOutput> {
    return this.executeRegistered('searchRouteTemplates', user, body, () =>
      this.tasks.searchRouteTemplatesForAgent(user, body),
    )
  }

  getMaterialParseResult(
    user: AiToolRequestUser,
    body: unknown,
  ): Promise<GetMaterialParseResultOutput> {
    return this.executeRegistered('getMaterialParseResult', user, body, () =>
      this.tasks.getMaterialParseResultForAgent(user, body),
    )
  }

  submitReviewPackage(
    user: AiToolRequestUser,
    body: unknown,
  ): Promise<SubmitReviewPackageOutput> {
    return this.executeRegistered('submitReviewPackage', user, body, async ({ action }) => {
      if (!action?.id) {
        throw new Error('REVIEW_PACKAGE_MISSING_ACTION')
      }
      return this.tasks.submitReviewPackageForAgent(user, body, { sourceActionId: action.id })
    })
  }

  private async executeRegistered<T>(
    name: 'getTaskContext' | 'searchRouteTemplates' | 'getMaterialParseResult' | 'submitReviewPackage',
    user: AiToolRequestUser,
    body: unknown,
    forward: (context: AiActionForwardContext) => Promise<T>,
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
    agentDefinition: user.agentDefinition,
    grantedCapabilities: user.grantedCapabilities,
  }
}
