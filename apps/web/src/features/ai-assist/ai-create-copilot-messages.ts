import type { CopilotChatViewProps } from '@copilotkit/react-core/v2'
import type { AiConversationEventView, AiInputBatchStatus, AiInputBatchView } from '@xiaotuanbao/shared'

export const BATCH_STATUS_ACTIVITY_TYPE = 'ai-create-batch-status'
export const INTERACTION_ACTIVITY_TYPE = 'ai-create-interaction'

type ChatMessage = NonNullable<CopilotChatViewProps['messages']>[number]

const RUNNING_BATCH_STATUSES: ReadonlySet<AiInputBatchStatus> = new Set([
  'waiting_for_materials',
])

export type FailedMaterialNotice = {
  materialId: string
  originalFilename: string
  errorMessage: string | null
}

export type BatchStatusActivityContent = {
  label: string
  batchId?: string
  failedMaterials?: FailedMaterialNotice[]
  showMaterialActions?: boolean
  showStopAction?: boolean
}

export type InteractionActivityContent = {
  interactionId: string
  eventId: string
  type: 'free_text' | 'single_choice'
  prompt: string
  options: Array<{ id: string; label: string }>
  version: number
  status: 'pending' | 'answered' | 'cancelled'
}

type MaterialProgress = {
  ready?: number
  total?: number
  failed?: number
}

export function batchStatusLabel(
  status: string,
  progress?: MaterialProgress | null,
  extra?: { queued?: boolean; reason?: string },
): string | null {
  if (status === 'waiting_for_materials') {
    const ready = progress?.ready
    const total = progress?.total
    const failed = progress?.failed ?? 0
    if (failed > 0) {
      return `有 ${failed} 个资料解析失败，请重试、移除后继续或放弃本批`
    }
    if (typeof ready === 'number' && typeof total === 'number' && total > 0) {
      return `已上传 ${total} 个，解析 ${ready}/${total}`
    }
    return '资料处理中'
  }
  if (status === 'ready_for_agent') return extra?.queued ? '已排队' : '已发送'
  if (status === 'agent_running') return 'AI 处理中'
  if (status === 'awaiting_user_input') return '等待回答'
  if (status === 'awaiting_review') return 'AI 建议待审核'
  if (status === 'completed') return '已完成'
  if (status === 'failed') return '处理失败'
  if (status === 'cancelled') {
    if (extra?.reason === 'interaction_cancelled') return '已取消等待'
    if (extra?.reason === 'user_stop') return '已停止当前处理'
    return '已放弃本批'
  }
  return null
}

export function interactionFromPayload(
  payload: Record<string, unknown>,
  eventId?: string,
): InteractionActivityContent | null {
  const raw = payload.interaction
  if (!raw || typeof raw !== 'object') {
    return null
  }
  const record = raw as Record<string, unknown>
  if (
    typeof record.interactionId !== 'string' ||
    (record.type !== 'free_text' && record.type !== 'single_choice') ||
    typeof record.prompt !== 'string'
  ) {
    return null
  }
  const options = Array.isArray(record.options)
    ? record.options.flatMap((item) => {
        if (!item || typeof item !== 'object') {
          return []
        }
        const option = item as Record<string, unknown>
        if (typeof option.id !== 'string' || typeof option.label !== 'string') {
          return []
        }
        return [{ id: option.id, label: option.label }]
      })
    : []
  return {
    interactionId: record.interactionId,
    eventId: typeof record.eventId === 'string' ? record.eventId : eventId ?? '',
    type: record.type,
    prompt: record.prompt,
    options,
    version: typeof record.version === 'number' ? record.version : 1,
    status:
      record.status === 'answered' || record.status === 'cancelled' ? record.status : 'pending',
  }
}

export function resolveInteractionStatus(
  events: AiConversationEventView[],
  interaction: InteractionActivityContent,
): InteractionActivityContent['status'] {
  for (const event of events) {
    if (event.kind === 'user_message' && event.payload.interactionId === interaction.interactionId) {
      return 'answered'
    }
    if (
      event.kind === 'batch_status' &&
      event.payload.interactionId === interaction.interactionId
    ) {
      if (
        event.payload.interactionStatus === 'cancelled' ||
        event.payload.reason === 'interaction_cancelled'
      ) {
        return 'cancelled'
      }
      if (event.payload.interactionStatus === 'answered') {
        return 'answered'
      }
    }
  }
  return interaction.status
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
  const failed = payload.failedCount
  if (typeof ready === 'number' && typeof total === 'number') {
    return { ready, total, failed: typeof failed === 'number' ? failed : 0 }
  }
  return null
}

function failedMaterialsFromPayload(payload: Record<string, unknown>): FailedMaterialNotice[] {
  const raw = payload.failedMaterials
  if (!Array.isArray(raw)) {
    return []
  }
  return raw.flatMap((item) => {
    if (!item || typeof item !== 'object') {
      return []
    }
    const record = item as Record<string, unknown>
    if (typeof record.materialId !== 'string' || typeof record.originalFilename !== 'string') {
      return []
    }
    return [
      {
        materialId: record.materialId,
        originalFilename: record.originalFilename,
        errorMessage: typeof record.errorMessage === 'string' ? record.errorMessage : null,
      },
    ]
  })
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
  if (status === 'waiting_for_materials') {
    const failed = latestFailedCount(events, activeBatch)
    return failed === 0
  }
  return status !== null && RUNNING_BATCH_STATUSES.has(status as AiInputBatchStatus)
}

function latestFailedCount(
  events: AiConversationEventView[],
  activeBatch: AiInputBatchView | null,
): number {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    if (event.kind === 'batch_status') {
      return typeof event.payload.failedCount === 'number' ? event.payload.failedCount : 0
    }
  }
  return activeBatch?.materialProgress?.failed ?? 0
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
  const statusSlots = new Map<string, number>()
  const upsertStatus = (content: BatchStatusActivityContent) => {
    const key = content.batchId ?? 'current'
    const item: ChatMessage = {
      id: `batch-status-${key}`,
      role: 'activity',
      activityType: BATCH_STATUS_ACTIVITY_TYPE,
      content,
    }
    const existing = statusSlots.get(key)
    if (existing != null) {
      messages[existing] = item
      return
    }
    statusSlots.set(key, messages.length)
    messages.push(item)
  }

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
      const interaction = interactionFromPayload(event.payload, event.id)
      if (interaction) {
        messages.push({
          id: `interaction-${interaction.interactionId}`,
          role: 'activity',
          activityType: INTERACTION_ACTIVITY_TYPE,
          content: {
            ...interaction,
            eventId: interaction.eventId || event.id || `event-${event.sequence}`,
            status: resolveInteractionStatus(events, interaction),
          } satisfies InteractionActivityContent,
        })
      }
      continue
    }
    if (event.kind === 'error') {
      if (typeof event.payload.materialId === 'string') {
        continue
      }
      messages.push({
        id: `event-${event.sequence}`,
        role: 'activity',
        activityType: BATCH_STATUS_ACTIVITY_TYPE,
        content: { label: '本批处理失败，可修改后重试' } satisfies BatchStatusActivityContent,
      })
      continue
    }
    if (event.kind === 'batch_status') {
      const status = String(event.payload.status ?? '')
      const progress = progressFromPayload(event.payload)
      const label = batchStatusLabel(status, progress, {
        queued: event.payload.queued === true,
        reason: typeof event.payload.reason === 'string' ? event.payload.reason : undefined,
      })
      if (label) {
        const failedMaterials = failedMaterialsFromPayload(event.payload)
        upsertStatus({
          label,
          batchId: typeof event.payload.batchId === 'string' ? event.payload.batchId : undefined,
          failedMaterials,
          showMaterialActions: status === 'waiting_for_materials' && failedMaterials.length > 0,
          showStopAction:
            status === 'ready_for_agent' ||
            status === 'agent_running' ||
            status === 'awaiting_user_input',
        })
      }
    }
  }
  if (pendingText) {
    messages.push({
      id: 'pending-send',
      role: 'activity',
      activityType: BATCH_STATUS_ACTIVITY_TYPE,
      content: { label: pendingSendLabel(pendingUploadCount) } satisfies BatchStatusActivityContent,
    })
  } else if (activeBatch && statusSlots.size === 0) {
    const label = batchStatusLabel(activeBatch.status, activeBatch.materialProgress, {
      queued: activeBatch.queued === true,
    })
    if (label) {
      const failedMaterials = (activeBatch.materials ?? []).flatMap((item) =>
        item.status === 'failed'
          ? [
              {
                materialId: item.materialId,
                originalFilename: item.originalFilename,
                errorMessage: item.errorMessage,
              },
            ]
          : [],
      )
      upsertStatus({
        label,
        batchId: activeBatch.id,
        failedMaterials,
        showMaterialActions: activeBatch.status === 'waiting_for_materials' && failedMaterials.length > 0,
        showStopAction:
          activeBatch.status === 'ready_for_agent' ||
          activeBatch.status === 'agent_running' ||
          activeBatch.status === 'awaiting_user_input',
      })
    }
  }
  return messages
}
