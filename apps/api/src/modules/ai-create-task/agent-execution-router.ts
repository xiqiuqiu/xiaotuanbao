import {
  AI_CREATE_AGENT_DEFINITION_REF,
  CONVERSATION_GENERAL_AGENT_DEFINITION_REF,
  type VersionedDefinitionRef,
} from '@xiaotuanbao/ai-contracts'
import { AgentTaskType, InputBatchTaskRole } from '@prisma/client'
import type { ResolvedPageContext } from './page-locator.resolver'

export type FrozenAgentAssociation = {
  id: string
  agentDefinition: VersionedDefinitionRef
  taskId?: string
}

export type FrozenAgentTaskRef = {
  taskId: string
  role: InputBatchTaskRole
  taskType: AgentTaskType
}

export type AgentExecutionRoutingInput = {
  associations: {
    interaction?: FrozenAgentAssociation
    reviewPackage?: FrozenAgentAssociation
    taskRefs: readonly FrozenAgentTaskRef[]
  }
  pageAttachment?: ResolvedPageContext
  registeredIntent?: { key: string }
}

export type AgentExecutionRoute =
  | {
      kind: 'execution_definition'
      source: 'interaction' | 'review_package' | 'task' | 'registered_intent' | 'default'
      agentDefinition: VersionedDefinitionRef
      taskId?: string
    }
  | {
      kind: 'persistent_follow_up'
      registeredIntentKey: string
      promptKey: string
    }
  | {
      kind: 'task_creation_proposal'
      registeredIntentKey: string
      taskType: AgentTaskType
      requiredPermissionKey: string
    }

export type RegisteredIntentRoute =
  | {
      intentKey: string
      kind: 'execution_definition'
      agentDefinition: VersionedDefinitionRef
    }
  | {
      intentKey: string
      kind: 'persistent_follow_up'
      promptKey: string
    }
  | {
      intentKey: string
      kind: 'task_creation_proposal'
      taskType: AgentTaskType
      requiredPermissionKey: string
    }

const TASK_DEFINITIONS: Readonly<Record<AgentTaskType, VersionedDefinitionRef>> = {
  [AgentTaskType.departure_creation]: AI_CREATE_AGENT_DEFINITION_REF,
}

/**
 * Agent 执行路由只决定允许的执行定义或控制面提案，不装配工具或计算能力授予。
 * 页面附件刻意属于输入快照，但不参与下面的决策顺序。
 */
export class AgentExecutionRouter {
  constructor(private readonly intentRoutes: readonly RegisteredIntentRoute[] = []) {}

  route(input: Readonly<AgentExecutionRoutingInput>): AgentExecutionRoute {
    if (input.associations.interaction) {
      return definitionRoute('interaction', input.associations.interaction)
    }
    if (input.associations.reviewPackage) {
      return definitionRoute('review_package', input.associations.reviewPackage)
    }

    const taskRef =
      input.associations.taskRefs.find((item) => item.role === InputBatchTaskRole.primary) ??
      input.associations.taskRefs.find((item) => item.role === InputBatchTaskRole.created)
    if (taskRef) {
      return {
        kind: 'execution_definition',
        source: 'task',
        agentDefinition: TASK_DEFINITIONS[taskRef.taskType],
        taskId: taskRef.taskId,
      }
    }

    const intentRoute = input.registeredIntent
      ? this.intentRoutes.find((item) => item.intentKey === input.registeredIntent?.key)
      : undefined
    if (intentRoute?.kind === 'execution_definition') {
      return {
        kind: 'execution_definition',
        source: 'registered_intent',
        agentDefinition: intentRoute.agentDefinition,
      }
    }
    if (intentRoute?.kind === 'persistent_follow_up') {
      return {
        kind: 'persistent_follow_up',
        registeredIntentKey: intentRoute.intentKey,
        promptKey: intentRoute.promptKey,
      }
    }
    if (intentRoute?.kind === 'task_creation_proposal') {
      return {
        kind: 'task_creation_proposal',
        registeredIntentKey: intentRoute.intentKey,
        taskType: intentRoute.taskType,
        requiredPermissionKey: intentRoute.requiredPermissionKey,
      }
    }

    return {
      kind: 'execution_definition',
      source: 'default',
      agentDefinition: CONVERSATION_GENERAL_AGENT_DEFINITION_REF,
    }
  }
}

function definitionRoute(
  source: 'interaction' | 'review_package',
  association: FrozenAgentAssociation,
): AgentExecutionRoute {
  return {
    kind: 'execution_definition',
    source,
    agentDefinition: association.agentDefinition,
    ...(association.taskId ? { taskId: association.taskId } : {}),
  }
}
