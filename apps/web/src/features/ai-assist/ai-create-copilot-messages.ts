import type { CopilotChatViewProps } from '@copilotkit/react-core/v2'
import type { AiConversationEventView, AiInputBatchStatus, AiInputBatchView } from '@xiaotuanbao/shared'

export const BATCH_STATUS_ACTIVITY_TYPE = 'ai-create-batch-status'

type ChatMessage = NonNullable<CopilotChatViewProps['messages']>[number]

const RUNNING_BATCH_STATUSES: ReadonlySet<AiInputBatchStatus> = new Set([
  'waiting_for_materials',
  'ready_for_agent',
  'agent_running',
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

type MaterialProgress = {
  ready?: number
  total?: number
  failed?: number
}

export function batchStatusLabel(
  status: string,
  progress?: MaterialProgress | null,
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
  if (status === 'ready_for_agent') return '已发送'
  if (status === 'agent_running') return 'AI 处理中'
  if (status === 'completed') return '已完成'
  if (status === 'failed') return '处理失败'
  if (status === 'cancelled') return '已放弃本批'
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
  let statusSlot = -1
  const upsertStatus = (content: BatchStatusActivityContent) => {
    const item: ChatMessage = {
      id: 'batch-status-current',
      role: 'activity',
      activityType: BATCH_STATUS_ACTIVITY_TYPE,
      content,
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
      if (typeof event.payload.materialId === 'string') {
        continue
      }
      messages.push({
        id: `event-${event.sequence}`,
        role: 'activity',
        activityType: BATCH_STATUS_ACTIVITY_TYPE,
        content: { label: '本批处理失败，可修改后重试' } satisfies BatchStatusActivityContent,
      })
      statusSlot = -1
      continue
    }
    if (event.kind === 'batch_status') {
      const status = String(event.payload.status ?? '')
      const progress = progressFromPayload(event.payload)
      const label = batchStatusLabel(status, progress)
      if (label) {
        const failedMaterials = failedMaterialsFromPayload(event.payload)
        upsertStatus({
          label,
          batchId: typeof event.payload.batchId === 'string' ? event.payload.batchId : undefined,
          failedMaterials,
          showMaterialActions: status === 'waiting_for_materials' && failedMaterials.length > 0,
          showStopAction: status === 'ready_for_agent' || status === 'agent_running',
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
  } else if (statusSlot < 0 && activeBatch) {
    const label = batchStatusLabel(activeBatch.status, activeBatch.materialProgress)
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
        showStopAction: activeBatch.status === 'ready_for_agent' || activeBatch.status === 'agent_running',
      })
    }
  }
  return messages
}
