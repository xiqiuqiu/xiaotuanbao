import { z } from 'zod'
import { AI_CREATE_AGENT_DEFINITION_REF } from './ai-create-definitions'
import { versionedDefinitionRefSchema, type VersionedDefinitionRef } from './agent-platform'

export const DEPARTURE_CREATION_TASK_TYPE = 'departure_creation' as const
export const DEPARTURE_CREATION_GOAL_INTENT_KEY = 'task.departure-creation.requested'
export const DEPARTURE_CREATION_ROUTING_DECISION = 'propose_departure_creation' as const

const taskTypeSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/)

const TASK_ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/

export type TaskWorkspaceDescriptor = {
  pathname: string
  taskIdSearchParam: string
}

export type TaskCompletedRouteDescriptor = {
  pathname: string
  objectIdParam: string
  search?: Readonly<Record<string, string>>
}

export type TaskRegisteredIntent = {
  key: string
  routingDecision: string
  kind: 'task_creation_proposal'
}

export type TaskDescriptor = {
  taskType: string
  version: number
  defaultTitle: string
  attachmentLabel: string
  requiredPermissionKey: string
  agentDefinition: VersionedDefinitionRef
  registeredIntent: TaskRegisteredIntent
  workspace: TaskWorkspaceDescriptor
  completedRoute: TaskCompletedRouteDescriptor
  activity: {
    regionLabel: string
    actionLabel: string
  }
}

export type AgentTaskPageAttachment = {
  kind: 'agent_task'
  taskType: string
  taskId: string
}

export type TaskIntentRoute = {
  intentKey: string
  kind: 'task_creation_proposal'
  taskType: string
  requiredPermissionKey: string
}

export type TaskWorkspaceHref = {
  pathname: string
  search: Record<string, string>
}

export type TaskCompletedHref = {
  pathname: string
  params: Record<string, string>
  search?: Record<string, string>
}

export class TaskDescriptorRegistry {
  private readonly byTaskType = new Map<string, TaskDescriptor>()
  private readonly byIntentKey = new Map<string, TaskDescriptor>()
  private readonly byRoutingDecision = new Map<string, TaskDescriptor>()
  private readonly byAgentDefinition = new Map<string, TaskDescriptor>()
  private readonly byWorkspacePath = new Map<string, TaskDescriptor>()
  private readonly descriptors: TaskDescriptor[] = []

  constructor(definitions: readonly TaskDescriptor[]) {
    for (const descriptor of definitions) {
      this.register(descriptor)
    }
  }

  getByTaskType(taskType: string): TaskDescriptor {
    const descriptor = this.findByTaskType(taskType)
    if (!descriptor) {
      throw new Error(`Task Descriptor 未登记: ${taskType}`)
    }
    return descriptor
  }

  findByTaskType(taskType: string): TaskDescriptor | undefined {
    return this.byTaskType.get(taskType)
  }

  findByIntentKey(key: string): TaskDescriptor | undefined {
    return this.byIntentKey.get(key)
  }

  findByRoutingDecision(decision: string): TaskDescriptor | undefined {
    return this.byRoutingDecision.get(decision)
  }

  findByAgentDefinition(ref: VersionedDefinitionRef): TaskDescriptor | undefined {
    return this.byAgentDefinition.get(definitionId(ref))
  }

  findByWorkspacePath(pathname: string): TaskDescriptor | undefined {
    return this.byWorkspacePath.get(pathname)
  }

  all(): readonly TaskDescriptor[] {
    return this.descriptors
  }

  intentRoutes(): TaskIntentRoute[] {
    return this.descriptors.map((descriptor) => ({
      intentKey: descriptor.registeredIntent.key,
      kind: descriptor.registeredIntent.kind,
      taskType: descriptor.taskType,
      requiredPermissionKey: descriptor.requiredPermissionKey,
    }))
  }

  taskCreationRoutingDecisions(): string[] {
    return this.descriptors.map((descriptor) => descriptor.registeredIntent.routingDecision)
  }

  private register(descriptor: TaskDescriptor): void {
    taskTypeSchema.parse(descriptor.taskType)
    versionedDefinitionRefSchema.parse(descriptor.agentDefinition)
    if (this.byTaskType.has(descriptor.taskType)) {
      throw new Error(`Task Descriptor 重复注册: ${descriptor.taskType}`)
    }
    this.byTaskType.set(descriptor.taskType, descriptor)
    this.byIntentKey.set(descriptor.registeredIntent.key, descriptor)
    this.byRoutingDecision.set(descriptor.registeredIntent.routingDecision, descriptor)
    this.byAgentDefinition.set(definitionId(descriptor.agentDefinition), descriptor)
    this.byWorkspacePath.set(descriptor.workspace.pathname, descriptor)
    this.descriptors.push(descriptor)
  }
}

export const DEPARTURE_CREATION_TASK_DESCRIPTOR: TaskDescriptor = {
  taskType: DEPARTURE_CREATION_TASK_TYPE,
  version: 1,
  defaultTitle: '创建发团',
  attachmentLabel: '当前建团工作',
  requiredPermissionKey: 'departure:write',
  agentDefinition: AI_CREATE_AGENT_DEFINITION_REF,
  registeredIntent: {
    key: DEPARTURE_CREATION_GOAL_INTENT_KEY,
    routingDecision: DEPARTURE_CREATION_ROUTING_DECISION,
    kind: 'task_creation_proposal',
  },
  workspace: {
    pathname: '/departure/new',
    taskIdSearchParam: 'taskId',
  },
  completedRoute: {
    pathname: '/departure/$departureId',
    objectIdParam: 'departureId',
    search: { tab: 'overview' },
  },
  activity: {
    regionLabel: 'Agent 任务',
    actionLabel: '查看任务',
  },
}

export const registeredTaskDescriptors = new TaskDescriptorRegistry([
  DEPARTURE_CREATION_TASK_DESCRIPTOR,
])

export function matchTaskWorkspaceAttachment(
  pathname: string,
  search?: string,
  registry: TaskDescriptorRegistry = registeredTaskDescriptors,
): AgentTaskPageAttachment | null {
  const descriptor = registry.findByWorkspacePath(pathname)
  if (!descriptor) {
    return null
  }
  const taskId = searchParam(search, descriptor.workspace.taskIdSearchParam)
  if (!taskId || !TASK_ID_PATTERN.test(taskId)) {
    return null
  }
  return {
    kind: 'agent_task',
    taskType: descriptor.taskType,
    taskId,
  }
}

export function buildTaskWorkspaceHref(
  descriptor: TaskDescriptor,
  taskId: string,
): TaskWorkspaceHref {
  return {
    pathname: descriptor.workspace.pathname,
    search: { [descriptor.workspace.taskIdSearchParam]: taskId },
  }
}

export function buildTaskCompletedHref(
  descriptor: TaskDescriptor,
  objectId: string,
): TaskCompletedHref {
  return {
    pathname: descriptor.completedRoute.pathname,
    params: { [descriptor.completedRoute.objectIdParam]: objectId },
    ...(descriptor.completedRoute.search
      ? { search: { ...descriptor.completedRoute.search } }
      : {}),
  }
}

function definitionId(ref: VersionedDefinitionRef): string {
  return `${ref.key}@${ref.version}`
}

function searchParam(search: string | undefined, key: string): string | null {
  if (!search) {
    return null
  }
  const query = search.startsWith('?') ? search.slice(1) : search
  for (const pair of query.split('&')) {
    if (!pair) {
      continue
    }
    const eq = pair.indexOf('=')
    const rawKey = eq === -1 ? pair : pair.slice(0, eq)
    if (decodeURIComponent(rawKey.replace(/\+/g, ' ')) !== key) {
      continue
    }
    const rawValue = eq === -1 ? '' : pair.slice(eq + 1)
    const value = decodeURIComponent(rawValue.replace(/\+/g, ' ')).trim()
    return value || null
  }
  return null
}
