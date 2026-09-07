import {
  DEPARTURE_COLLABORATION_TASK_TYPE,
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

export function agentTaskWorkspaceNavigation(
  taskId: string,
  taskType?: string,
  extras?: { departureId?: string },
) {
  const descriptor = requireDescriptor(taskType)
  if (descriptor.taskType === DEPARTURE_COLLABORATION_TASK_TYPE) {
    if (!extras?.departureId) {
      throw new Error('发团协作审核需要 departureId')
    }
    return {
      to: '/departure/$departureId' as DepartureCompletedTo,
      params: { departureId: extras.departureId },
    }
  }
  const href = buildTaskWorkspaceHref(descriptor, taskId)
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

export function departureIdFromPathname(pathname: string): string | undefined {
  const match = pathname.match(/^\/departure\/(?!new$)([^/]+)$/)
  return match?.[1]
}

export function isCurrentAgentTaskWorkspace(
  pathname: string,
  search: string,
  taskId: string,
  taskType?: string,
  extras?: { departureId?: string },
): boolean {
  const descriptor = descriptorFor(taskType)
  if (!descriptor) {
    return false
  }
  if (descriptor.taskType === DEPARTURE_COLLABORATION_TASK_TYPE) {
    if (extras?.departureId) {
      return pathname === `/departure/${extras.departureId}`
    }
    return departureIdFromPathname(pathname) != null
  }
  const currentTaskId = new URLSearchParams(search.replace(/^\?/, '')).get(
    descriptor.workspace.taskIdSearchParam,
  )
  return pathname === descriptor.workspace.pathname && currentTaskId === taskId
}
