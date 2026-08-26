import { Injectable } from '@nestjs/common'
import type {
  GetMaterialParseResultOutput,
  GetTaskContextOutput,
  ProposeReviewPackageOutput,
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
    const caller = requireTaskBoundUser(user)
    return this.executeRegistered('getTaskContext', caller, body, () =>
      this.tasks.getTaskContextForAgent(caller, body),
    )
  }

  searchRouteTemplates(
    user: AiToolRequestUser,
    body: unknown,
  ): Promise<SearchRouteTemplatesOutput> {
    const caller = requireTaskBoundUser(user)
    return this.executeRegistered('searchRouteTemplates', caller, body, () =>
      this.tasks.searchRouteTemplatesForAgent(caller, body),
    )
  }

  getMaterialParseResult(
    user: AiToolRequestUser,
    body: unknown,
  ): Promise<GetMaterialParseResultOutput> {
    const caller = requireTaskBoundUser(user)
    return this.executeRegistered('getMaterialParseResult', caller, body, () =>
      this.tasks.getMaterialParseResultForAgent(caller, body),
    )
  }

  proposeReviewPackage(
    user: AiToolRequestUser,
    body: unknown,
  ): Promise<ProposeReviewPackageOutput> {
    const caller = requireTaskBoundUser(user)
    return this.tasks.proposeReviewPackageForAgent(caller, body)
  }

  submitReviewPackage(
    user: AiToolRequestUser,
    body: unknown,
  ): Promise<SubmitReviewPackageOutput> {
    const caller = requireTaskBoundUser(user)
    return this.executeRegistered('proposeReviewPackage', caller, body, async ({ action }) => {
      if (!action?.id) {
        throw new Error('REVIEW_PACKAGE_MISSING_ACTION')
      }
      return this.tasks.submitReviewPackageForAgent(caller, body, { sourceActionId: action.id })
    })
  }

  private async executeRegistered<T>(
    name: 'getTaskContext' | 'searchRouteTemplates' | 'getMaterialParseResult' | 'proposeReviewPackage',
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

function requireTaskBoundUser(
  user: AiToolRequestUser,
): AiToolRequestUser & { taskId: string; runId: string } {
  if (!user.taskId || !user.runId) {
    throw AiCollaborationHttpException.fromCode('DELEGATION_INVALID')
  }
  return { ...user, taskId: user.taskId, runId: user.runId }
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
