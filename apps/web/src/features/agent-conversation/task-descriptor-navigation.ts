import {
  DEPARTURE_CREATION_TASK_DESCRIPTOR,
  buildTaskCompletedHref,
  buildTaskWorkspaceHref,
  registeredTaskDescriptors,
  type TaskDescriptor,
} from '@xiaotuanbao/ai-contracts'

type DepartureWorkspaceTo = '/departure/new'
type DepartureCompletedTo = '/departure/$departureId'

function descriptorFor(taskType?: string): TaskDescriptor | undefined {
  if (!taskType) {
    return DEPARTURE_CREATION_TASK_DESCRIPTOR
  }
  return registeredTaskDescriptors.findByTaskType(taskType)
}

function requireDescriptor(taskType?: string): TaskDescriptor {
  const descriptor = descriptorFor(taskType)
  if (!descriptor) {
    throw new Error(`Task Descriptor 未登记: ${taskType}`)
  }
  return descriptor
}

export function resolveRegisteredTaskDescriptor(taskType?: string) {
  return descriptorFor(taskType)
}

export function agentTaskWorkspaceNavigation(taskId: string, taskType?: string) {
  const href = buildTaskWorkspaceHref(requireDescriptor(taskType), taskId)
  return {
    to: href.pathname as DepartureWorkspaceTo,
    search: href.search as { taskId: string },
  }
}

export function agentTaskCompletedNavigation(objectId: string, taskType?: string) {
  const href = buildTaskCompletedHref(requireDescriptor(taskType), objectId)
  return {
    to: href.pathname as DepartureCompletedTo,
    params: href.params as { departureId: string },
    search: href.search as { tab: 'overview' },
  }
}

export function isCurrentAgentTaskWorkspace(
  pathname: string,
  search: string,
  taskId: string,
  taskType?: string,
): boolean {
  const descriptor = descriptorFor(taskType)
  if (!descriptor) {
    return false
  }
  const currentTaskId = new URLSearchParams(search.replace(/^\?/, '')).get(
    descriptor.workspace.taskIdSearchParam,
  )
  return pathname === descriptor.workspace.pathname && currentTaskId === taskId
}
