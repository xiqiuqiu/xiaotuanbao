import {
  matchTaskWorkspaceAttachment,
  registeredTaskDescriptors,
  type AgentTaskPageAttachment,
} from '@xiaotuanbao/ai-contracts'
import {
  pageLocatorLabel,
  parsePageLocatorFromLocation,
  type PageLocator,
} from '@xiaotuanbao/shared'

export type AgentCurrentPageAttachment =
  | { kind: 'page_locator'; locator: PageLocator }
  | AgentTaskPageAttachment

export function currentPageAttachmentFromLocation(
  pathname: string,
  search?: string,
): AgentCurrentPageAttachment | null {
  const taskAttachment = matchTaskWorkspaceAttachment(pathname, search)
  if (taskAttachment) {
    return taskAttachment
  }
  const locator = parsePageLocatorFromLocation(pathname, search)
  return locator ? { kind: 'page_locator', locator } : null
}

export function currentPageAttachmentLabel(attachment: AgentCurrentPageAttachment): string {
  if (attachment.kind === 'page_locator') {
    return pageLocatorLabel(attachment.locator)
  }
  return registeredTaskDescriptors.getByTaskType(attachment.taskType).attachmentLabel
}

export type ConversationSendContext =
  | { pageLocator: PageLocator; primaryTaskId?: never }
  | { primaryTaskId: string; pageLocator?: never }
  | { pageLocator?: never; primaryTaskId?: never }

export function conversationSendContextFromAttachment(
  attachment: AgentCurrentPageAttachment | null,
): ConversationSendContext {
  if (!attachment) {
    return {}
  }
  if (attachment.kind === 'page_locator') {
    return { pageLocator: attachment.locator }
  }
  return { primaryTaskId: attachment.taskId }
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
