import {
  CONVERSATION_GENERAL_AGENT_DEFINITION_REF,
  registeredTaskDescriptors,
  type TaskDescriptorRegistry,
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

export function intentRoutesFromTaskDescriptors(
  registry: TaskDescriptorRegistry = registeredTaskDescriptors,
): RegisteredIntentRoute[] {
  return registry.intentRoutes().map((route) => ({
    intentKey: route.intentKey,
    kind: route.kind,
    taskType: asAgentTaskType(route.taskType),
    requiredPermissionKey: route.requiredPermissionKey,
  }))
}

/**
 * Agent 执行路由只决定允许的执行定义或控制面提案，不装配工具或计算能力授予。
 * 页面附件刻意属于输入快照，但不参与下面的决策顺序。
 */
export class AgentExecutionRouter {
  private readonly intentRoutes: readonly RegisteredIntentRoute[]
  private readonly descriptors: TaskDescriptorRegistry

  constructor(
    extraIntentRoutes: readonly RegisteredIntentRoute[] = [],
    descriptors: TaskDescriptorRegistry = registeredTaskDescriptors,
  ) {
    this.descriptors = descriptors
    this.intentRoutes = [...intentRoutesFromTaskDescriptors(descriptors), ...extraIntentRoutes]
  }

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
        agentDefinition: this.descriptors.getByTaskType(taskRef.taskType).agentDefinition,
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

function asAgentTaskType(taskType: string): AgentTaskType {
  if ((Object.values(AgentTaskType) as string[]).includes(taskType)) {
    return taskType as AgentTaskType
  }
  throw new Error(`未登记的 Agent 任务类型: ${taskType}`)
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
