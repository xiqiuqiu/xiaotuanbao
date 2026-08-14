import type { CopilotChatViewProps } from '@copilotkit/react-core/v2'
import type { AiConversationEventView, AiInputBatchStatus, AiInputBatchView } from '@xiaotuanbao/shared'

export const BATCH_STATUS_ACTIVITY_TYPE = 'ai-create-batch-status'

type ChatMessage = NonNullable<CopilotChatViewProps['messages']>[number]

const RUNNING_BATCH_STATUSES: ReadonlySet<AiInputBatchStatus> = new Set([
  'waiting_for_materials',
  'ready_for_agent',
  'agent_running',
])

type MaterialProgress = {
  ready?: number
  total?: number
}

export function batchStatusLabel(
  status: string,
  progress?: MaterialProgress | null,
): string | null {
  if (status === 'waiting_for_materials') {
    const ready = progress?.ready
    const total = progress?.total
    if (typeof ready === 'number' && typeof total === 'number' && total > 0) {
      return `已上传 ${total} 个，解析 ${ready}/${total}`
    }
    return '资料处理中'
  }
  if (status === 'ready_for_agent') return '已发送'
  if (status === 'agent_running') return 'AI 处理中'
  if (status === 'completed') return '已完成'
  if (status === 'failed') return '处理失败'
  return null
}

export function latestBatchStatus(
  events: AiConversationEventView[],
  activeBatch: AiInputBatchView | null,
): string | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    if (event.kind === 'batch_status') {
      return String(event.payload.status ?? '')
    }
  }
  return activeBatch?.status ?? null
}

function progressFromPayload(payload: Record<string, unknown>): MaterialProgress | null {
  const ready = payload.readyCount
  const total = payload.totalCount
  if (typeof ready === 'number' && typeof total === 'number') {
    return { ready, total }
  }
  return null
}

export function isCopilotChatRunning(
  events: AiConversationEventView[],
  activeBatch: AiInputBatchView | null,
  pendingText: string | null,
): boolean {
  if (pendingText) {
    return true
  }
  const status = latestBatchStatus(events, activeBatch)
  return status !== null && RUNNING_BATCH_STATUSES.has(status as AiInputBatchStatus)
}

function pendingSendLabel(pendingUploadCount: number): string {
  if (pendingUploadCount > 0) {
    return `上传 ${pendingUploadCount} 个附件`
  }
  return '发送中'
}

export function toCopilotChatMessages(
  events: AiConversationEventView[],
  pendingText: string | null,
  activeBatch: AiInputBatchView | null,
  pendingUploadCount = 0,
): ChatMessage[] {
  const messages: ChatMessage[] = []
  let statusSlot = -1
  const upsertStatus = (label: string) => {
    const item: ChatMessage = {
      id: 'batch-status-current',
      role: 'activity',
      activityType: BATCH_STATUS_ACTIVITY_TYPE,
      content: { label },
    }
    if (statusSlot >= 0) {
      messages[statusSlot] = item
      return
    }
    statusSlot = messages.length
    messages.push(item)
  }

  for (const event of events) {
    if (event.kind === 'user_message') {
      messages.push({
        id: `event-${event.sequence}`,
        role: 'user',
        content: String(event.payload.text ?? ''),
      })
      statusSlot = -1
      continue
    }
    if (event.kind === 'agent_message') {
      messages.push({
        id: `event-${event.sequence}`,
        role: 'assistant',
        content: String(event.payload.text ?? ''),
      })
      statusSlot = -1
      continue
    }
    if (event.kind === 'error') {
      messages.push({
        id: `event-${event.sequence}`,
        role: 'activity',
        activityType: BATCH_STATUS_ACTIVITY_TYPE,
        content: { label: '本批处理失败，可修改后重试' },
      })
      statusSlot = -1
      continue
    }
    if (event.kind === 'batch_status') {
      const label = batchStatusLabel(
        String(event.payload.status ?? ''),
        progressFromPayload(event.payload),
      )
      if (label) {
        upsertStatus(label)
      }
    }
  }
  if (pendingText) {
    messages.push({
      id: 'pending-send',
      role: 'activity',
      activityType: BATCH_STATUS_ACTIVITY_TYPE,
      content: { label: pendingSendLabel(pendingUploadCount) },
    })
  } else if (statusSlot < 0 && activeBatch) {
    const label = batchStatusLabel(activeBatch.status, activeBatch.materialProgress)
    if (label) {
      upsertStatus(label)
    }
  }
  return messages
}
