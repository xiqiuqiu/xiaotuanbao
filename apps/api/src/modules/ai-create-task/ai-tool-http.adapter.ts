import { Inject, Injectable } from '@nestjs/common'
import type {
  GetMaterialParseResultOutput,
  GetTaskContextOutput,
  ProposeReviewPackageOutput,
  ReadConversationHistoryOutput,
  ReadConversationSourceOutput,
  SearchRouteTemplatesOutput,
  SubmitReviewPackageOutput,
} from '@xiaotuanbao/ai-contracts'
import { AiActionGateway } from '../ai-action/ai-action.gateway'
import { claimedPositiveIntField, claimedStringField } from '../ai-action/ai-action.target'
import type { AiActionActor, AiActionForwardContext, AiActionNormalizedTarget } from '../ai-action/ai-action.types'
import { AiCollaborationHttpException } from './ai-collaboration.http-exception'
import { AiConversationRecallService } from './ai-conversation-recall.service'
import {
  AGENT_TASK_DOMAIN_ADAPTER,
  type AgentTaskDomainAdapter,
} from './agent-task-domain.adapter'
import type { AiToolRequestUser } from './ai-operation-delegation.guard'

@Injectable()
export class AiToolHttpAdapter {
  constructor(
    private readonly gateway: AiActionGateway,
    @Inject(AGENT_TASK_DOMAIN_ADAPTER)
    private readonly domain: AgentTaskDomainAdapter,
    private readonly recall: AiConversationRecallService,
  ) {}

  getTaskContext(user: AiToolRequestUser, body: unknown): Promise<GetTaskContextOutput> {
    const caller = requireTaskBoundUser(user)
    return this.executeRegistered('getTaskContext', caller, body, ({ target }) =>
      this.domain.getSnapshot(caller, {
        taskId: target.id,
        runId: caller.runId,
      }),
    )
  }

  searchRouteTemplates(
    user: AiToolRequestUser,
    body: unknown,
  ): Promise<SearchRouteTemplatesOutput> {
    const caller = requireTaskBoundUser(user)
    return this.executeRegistered('searchRouteTemplates', caller, body, ({ target }) =>
      this.domain.searchReferences(
        { ...caller, organizationId: target.id },
        {
          taskId: caller.taskId,
          runId: caller.runId,
          keyword: claimedStringField(body, 'keyword') ?? undefined,
          dayCount: claimedPositiveIntField(body, 'dayCount') ?? undefined,
        },
      ),
    )
  }

  getMaterialParseResult(
    user: AiToolRequestUser,
    body: unknown,
  ): Promise<GetMaterialParseResultOutput> {
    const caller = requireTaskBoundUser(user)
    return this.executeRegistered('getMaterialParseResult', caller, body, ({ target }) =>
      this.domain.getMaterial(caller, {
        taskId: caller.taskId,
        runId: caller.runId,
        materialId: target.id,
        parseResultVersion: requireTargetVersion(target),
        pageNumber: claimedPositiveIntField(body, 'pageNumber') ?? undefined,
      }),
    )
  }

  readConversationHistory(
    user: AiToolRequestUser,
    body: unknown,
  ): Promise<ReadConversationHistoryOutput> {
    return this.executeRegistered('readConversationHistory', user, body, () => {
      if (!user.conversationId || !user.inputBatchId) {
        throw AiCollaborationHttpException.fromCode('DELEGATION_INVALID')
      }
      return this.recall.readHistory({
        organizationId: user.organizationId,
        conversationId: user.conversationId,
        inputBatchId: user.inputBatchId,
        rawInput: body,
      })
    })
  }

  readConversationSource(
    user: AiToolRequestUser,
    body: unknown,
  ): Promise<ReadConversationSourceOutput> {
    return this.executeRegistered('readConversationSource', user, body, () => {
      if (!user.conversationId) {
        throw AiCollaborationHttpException.fromCode('DELEGATION_INVALID')
      }
      return this.recall.readSource({
        organizationId: user.organizationId,
        conversationId: user.conversationId,
        rawInput: body,
      })
    })
  }

  proposeReviewPackage(
    user: AiToolRequestUser,
    body: unknown,
  ): Promise<ProposeReviewPackageOutput> {
    const caller = requireTaskBoundUser(user)
    return this.domain.proposeReview(caller, body)
  }

  submitReviewPackage(
    user: AiToolRequestUser,
    body: unknown,
  ): Promise<SubmitReviewPackageOutput> {
    const caller = requireTaskBoundUser(user)
    return this.executeRegistered('proposeReviewPackage', caller, body, async ({ action, target }) => {
      if (!action?.id) {
        throw new Error('REVIEW_PACKAGE_MISSING_ACTION')
      }
      return this.domain.submitReview(
        caller,
        {
          taskId: caller.taskId,
          runId: caller.runId,
          objectVersion: requireTargetVersion(target),
          confirmationUnit: claimedStringField(body, 'confirmationUnit') ?? undefined,
          candidates: isRecord(body) ? body.candidates : undefined,
        },
        { sourceActionId: action.id },
      )
    })
  }

  private async executeRegistered<T>(
    name:
      | 'getTaskContext'
      | 'searchRouteTemplates'
      | 'getMaterialParseResult'
      | 'proposeReviewPackage'
      | 'readConversationHistory'
      | 'readConversationSource',
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
    if (executed.action?.reasonCode === 'TARGET_VERSION_MISMATCH') {
      throw AiCollaborationHttpException.fromCode('VERSION_CONFLICT')
    }
    throw AiCollaborationHttpException.fromCode('DELEGATION_INVALID')
  }
}

function requireTargetVersion(target: AiActionNormalizedTarget): number {
  if (target.version == null) {
    throw new Error('NORMALIZED_TARGET_VERSION_MISSING')
  }
  return target.version
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object'
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
