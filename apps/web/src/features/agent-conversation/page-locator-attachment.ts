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
  | { kind: 'page_locator'; locator: PageLocator; objectLabel?: string }
  | (AgentTaskPageAttachment & { reviewPackageId?: string })

const PAGE_SECTION_LABELS: Partial<Record<PageLocator['section'] & string, string>> = {
  accounts: '往来账款',
  overview: '概览信息',
  sourceOrders: '客源管理',
  execution: '执行安排',
  incomeRecords: '增收记录',
  receivables: '应收管理',
  payables: '应付管理',
  transactions: '收支流水',
  verifications: '核销记录',
}

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
    const sectionLabel = attachment.locator.section
      ? PAGE_SECTION_LABELS[attachment.locator.section]
      : undefined
    if (attachment.objectLabel) {
      return `当前页：${attachment.objectLabel}${sectionLabel ? ` · ${sectionLabel}` : ''}`
    }
    return pageLocatorLabel(attachment.locator)
  }
  const label = registeredTaskDescriptors.getByTaskType(attachment.taskType).attachmentLabel
  return attachment.reviewPackageId ? `${label} · 修订审核建议` : label
}

export type ConversationSendContext =
  | { pageLocator: PageLocator; primaryTaskId?: never }
  | { primaryTaskId: string; reviewPackageId?: string; pageLocator?: never }
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
  return { primaryTaskId: attachment.taskId, ...(attachment.reviewPackageId ? { reviewPackageId: attachment.reviewPackageId } : {}) }
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
