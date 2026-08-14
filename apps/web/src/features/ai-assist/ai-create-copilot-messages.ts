import type { CopilotChatViewProps } from '@copilotkit/react-core/v2'
import type { AiConversationEventView, AiInputBatchStatus, AiInputBatchView } from '@xiaotuanbao/shared'

export const BATCH_STATUS_ACTIVITY_TYPE = 'ai-create-batch-status'

type ChatMessage = NonNullable<CopilotChatViewProps['messages']>[number]

const RUNNING_BATCH_STATUSES: ReadonlySet<AiInputBatchStatus> = new Set([
  'ready_for_agent',
  'agent_running',
])

export function batchStatusLabel(status: string): string | null {
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

export function toCopilotChatMessages(
  events: AiConversationEventView[],
  pendingText: string | null,
  activeBatch: AiInputBatchView | null,
): ChatMessage[] {
  const messages: ChatMessage[] = []
  let sawBatchStatus = false
  for (const event of events) {
    if (event.kind === 'user_message') {
      messages.push({
        id: `event-${event.sequence}`,
        role: 'user',
        content: String(event.payload.text ?? ''),
      })
      continue
    }
    if (event.kind === 'agent_message') {
      messages.push({
        id: `event-${event.sequence}`,
        role: 'assistant',
        content: String(event.payload.text ?? ''),
      })
      continue
    }
    const label =
      event.kind === 'error'
        ? '本批处理失败，可修改后重试'
        : event.kind === 'batch_status'
          ? batchStatusLabel(String(event.payload.status ?? ''))
          : null
    if (!label) {
      continue
    }
    if (event.kind === 'batch_status') {
      sawBatchStatus = true
    }
    messages.push({
      id: `event-${event.sequence}`,
      role: 'activity',
      activityType: BATCH_STATUS_ACTIVITY_TYPE,
      content: { label },
    })
  }
  if (pendingText) {
    messages.push({
      id: 'pending-send',
      role: 'activity',
      activityType: BATCH_STATUS_ACTIVITY_TYPE,
      content: { label: '发送中' },
    })
  } else if (!sawBatchStatus && activeBatch) {
    const label = batchStatusLabel(activeBatch.status)
    if (label) {
      messages.push({
        id: `batch-${activeBatch.id}`,
        role: 'activity',
        activityType: BATCH_STATUS_ACTIVITY_TYPE,
        content: { label },
      })
    }
  }
  return messages
}
