import {
  pageLocatorLabel,
  parsePageLocatorFromLocation,
  type PageLocator,
} from '@xiaotuanbao/shared'

export type AgentCurrentPageAttachment =
  | { kind: 'page_locator'; locator: PageLocator }
  | { kind: 'departure_creation_task'; taskId: string }

const TASK_ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/

function searchParam(search: string | undefined, key: string): string | null {
  const value = new URLSearchParams(search?.startsWith('?') ? search.slice(1) : search).get(key)
  return value?.trim() || null
}

export function currentPageAttachmentFromLocation(
  pathname: string,
  search?: string,
): AgentCurrentPageAttachment | null {
  const locator = parsePageLocatorFromLocation(pathname, search)
  if (locator) {
    return { kind: 'page_locator', locator }
  }
  if (pathname !== '/departure/new') {
    return null
  }
  const taskId = searchParam(search, 'taskId')
  return taskId && TASK_ID_PATTERN.test(taskId)
    ? { kind: 'departure_creation_task', taskId }
    : null
}

export function currentPageAttachmentLabel(attachment: AgentCurrentPageAttachment): string {
  return attachment.kind === 'page_locator'
    ? pageLocatorLabel(attachment.locator)
    : '当前建团工作'
}

export function nextPageAttachment(input: {
  view: 'page' | 'history' | 'new'
  currentAttachment: AgentCurrentPageAttachment | null
  captured: boolean
}): AgentCurrentPageAttachment | null {
  if (input.captured) {
    return input.currentAttachment
  }
  if (input.view === 'history') {
    return null
  }
  return input.currentAttachment
}
