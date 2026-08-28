import {
  DEPARTURE_CREATION_TASK_DESCRIPTOR,
  buildTaskCompletedHref,
  buildTaskWorkspaceHref,
  registeredTaskDescriptors,
} from '@xiaotuanbao/ai-contracts'

type DepartureWorkspaceTo = '/departure/new'
type DepartureCompletedTo = '/departure/$departureId'

function descriptorFor(taskType?: string) {
  return (
    (taskType ? registeredTaskDescriptors.findByTaskType(taskType) : undefined) ??
    DEPARTURE_CREATION_TASK_DESCRIPTOR
  )
}

export function resolveRegisteredTaskDescriptor(taskType?: string) {
  return descriptorFor(taskType)
}

export function agentTaskWorkspaceNavigation(taskId: string, taskType?: string) {
  const href = buildTaskWorkspaceHref(descriptorFor(taskType), taskId)
  return {
    to: href.pathname as DepartureWorkspaceTo,
    search: href.search as { taskId: string },
  }
}

export function agentTaskCompletedNavigation(objectId: string, taskType?: string) {
  const href = buildTaskCompletedHref(descriptorFor(taskType), objectId)
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
  const currentTaskId = new URLSearchParams(search.replace(/^\?/, '')).get(
    descriptor.workspace.taskIdSearchParam,
  )
  return pathname === descriptor.workspace.pathname && currentTaskId === taskId
}
