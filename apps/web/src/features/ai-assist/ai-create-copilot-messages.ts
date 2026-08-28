import type { CopilotChatViewProps } from '@copilotkit/react-core/v2'
import {
  DEPARTURE_CREATION_TASK_DESCRIPTOR,
  registeredTaskDescriptors,
} from '@xiaotuanbao/ai-contracts'
import type {
  AiConversationEventView,
  AiInputBatchStatus,
  AiInputBatchView,
  AssistantSnapshotFrame,
} from '@xiaotuanbao/shared'

export const BATCH_STATUS_ACTIVITY_TYPE = 'ai-create-batch-status'
export const INTERACTION_ACTIVITY_TYPE = 'ai-create-interaction'
export const REVIEW_PACKAGE_ACTIVITY_TYPE = 'ai-create-review-package'
export const SEARCH_ROUTE_TEMPLATES_ACTIVITY_TYPE = 'ai-create-search-route-templates'
export const AGENT_TASK_ACTIVITY_TYPE = 'agent-task'

type ChatMessage = NonNullable<CopilotChatViewProps['messages']>[number]

const RUNNING_BATCH_STATUSES: ReadonlySet<AiInputBatchStatus> = new Set([
  'waiting_for_materials',
  'ready_for_agent',
  'preparing_context',
  'agent_running',
])

const QUEUED_BATCH_STATUSES: ReadonlySet<AiInputBatchStatus> = new Set([
  'waiting_for_materials',
  'ready_for_agent',
])

export type QueuedConversationMessage = {
  batchId: string
  text: string
  userEventSequence: number
}

export function projectQueuedConversationMessages(
  events: AiConversationEventView[],
  liveAssistant?: LiveAssistantSnapshot | null,
): {
  messages: QueuedConversationMessage[]
  visibleEvents: AiConversationEventView[]
} {
  const queuedByBatch = new Map<
    string,
    QueuedConversationMessage & { latestStatus: string; latestReason: string }
  >()
  const startedBatchIds = new Set<string>()

  for (let index = 0; index < events.length; index += 1) {
    const event = events[index]
    const payload = event.payload
    if (event.kind === 'agent_message' && typeof payload.batchId === 'string') {
      startedBatchIds.add(payload.batchId)
    }
    if (event.kind !== 'batch_status' || typeof payload.batchId !== 'string') {
      continue
    }
    const batchId = payload.batchId
    const status = String(payload.status ?? '')
    const queued = queuedByBatch.get(batchId)
    if (queued) {
      queued.latestStatus = status
      queued.latestReason = String(payload.reason ?? '')
      if (!QUEUED_BATCH_STATUSES.has(status as AiInputBatchStatus)) {
        startedBatchIds.add(batchId)
      }
      continue
    }
    const userEvent = events[index - 1]
    if (payload.queued !== true || userEvent?.kind !== 'user_message') {
      continue
    }
    queuedByBatch.set(batchId, {
      batchId,
      text: String(userEvent.payload.text ?? ''),
      userEventSequence: userEvent.sequence,
      latestStatus: status,
      latestReason: String(payload.reason ?? ''),
    })
  }

  const liveBatchId =
    liveAssistant && (liveAssistant.text || liveAssistant.reasoningText)
      ? liveAssistant.batchId
      : null

  const messages = [...queuedByBatch.values()]
    .filter((item) => {
      if (!QUEUED_BATCH_STATUSES.has(item.latestStatus as AiInputBatchStatus)) {
        return false
      }
      if (startedBatchIds.has(item.batchId)) {
        return false
      }
      return liveBatchId !== item.batchId
    })
    .sort((left, right) => left.userEventSequence - right.userEventSequence)
    .map(({ latestStatus: _latestStatus, latestReason: _latestReason, ...item }) => item)
  const activeQueuedBatchIds = new Set(messages.map((item) => item.batchId))
  const hiddenQueuedItems = [...queuedByBatch.values()].filter(
    (item) =>
      activeQueuedBatchIds.has(item.batchId) ||
      (item.latestStatus === 'cancelled' && item.latestReason === 'queue_retracted'),
  )
  const queuedBatchIds = new Set(hiddenQueuedItems.map((item) => item.batchId))
  const queuedUserSequences = new Set(hiddenQueuedItems.map((item) => item.userEventSequence))
  const releasedBatchIds = new Set(startedBatchIds)
  if (liveBatchId) {
    releasedBatchIds.add(liveBatchId)
  }

  const visibleEvents = events.filter((event) => {
      if (queuedUserSequences.has(event.sequence)) {
        return false
      }
      const batchId =
        typeof event.payload.batchId === 'string' ? event.payload.batchId : null
      if (batchId && queuedBatchIds.has(batchId)) {
        return false
      }
      if (
        event.kind === 'batch_status' &&
        event.payload.queued === true &&
        batchId &&
        releasedBatchIds.has(batchId)
      ) {
        return false
      }
      return true
    })
  const releasedQueuedItems = [...queuedByBatch.values()]
    .filter(
      (item) =>
        !queuedBatchIds.has(item.batchId) &&
        (startedBatchIds.has(item.batchId) || liveBatchId === item.batchId),
    )
    .sort((left, right) => left.userEventSequence - right.userEventSequence)
  for (const item of releasedQueuedItems) {
    const currentIndex = visibleEvents.findIndex(
      (event) => event.sequence === item.userEventSequence,
    )
    if (currentIndex < 0) {
      continue
    }
    const [userEvent] = visibleEvents.splice(currentIndex, 1)
    const startIndex = visibleEvents.findIndex(
      (event) =>
        event.payload.batchId === item.batchId &&
        (event.kind === 'agent_message' || event.kind === 'batch_status'),
    )
    visibleEvents.splice(startIndex < 0 ? visibleEvents.length : startIndex, 0, userEvent)
  }

  return {
    messages,
    visibleEvents,
  }
}

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
  showBatchRetryAction?: boolean
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

export type ReviewPackageActivityContent = {
  reviewPackageId: string
  fieldKeys: string[]
  taskId?: string
  taskType?: string
}

export type AgentTaskActivityContent = {
  taskId: string
  title: string
  status: string
  taskType?: string
}

export type SearchRouteTemplatesActivityContent = {
  items: Array<{
    id: string
    name: string
    defaultDayCount: number
    usageCount: number
    matchReasons: Array<Record<string, unknown>>
  }>
}

type MaterialProgress = {
  ready?: number
  total?: number
  failed?: number
}

export function batchStatusLabel(
  status: string,
  progress?: MaterialProgress | null,
  extra?: { queued?: boolean; reason?: string; disposition?: string; errorCode?: string },
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
  if (status === 'preparing_context') return '正在整理会话上下文'
  if (status === 'agent_running') return 'AI 处理中'
  if (status === 'awaiting_user_input') return '等待回答'
  if (status === 'awaiting_review') return '等待表单审核'
  if (status === 'completed') {
    if (extra?.disposition === 'rejected') return '已拒绝本次建议'
    return '已完成'
  }
  if (status === 'failed') return failedBatchLabel(extra?.errorCode)
  if (status === 'cancelled') {
    if (extra?.reason === 'interaction_cancelled') return '已取消等待'
    if (extra?.reason === 'user_stop') return '已停止当前处理'
    return '已放弃本批'
  }
  return null
}

function failedBatchLabel(errorCode?: string): string {
  if (errorCode === 'CONTEXT_CAPACITY_EXCEEDED') {
    return '上下文超出容量上限，请拆分或精简后再试'
  }
  if (errorCode === 'CONTEXT_PROFILE_MISSING') {
    return '当前模型未配置上下文容量'
  }
  if (errorCode === 'CONTEXT_PREPARE_FAILED') {
    return '会话上下文整理失败，将自动重试'
  }
  return '处理失败'
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

function reviewPackageFromPayload(
  payload: Record<string, unknown>,
  fallbackTaskId?: string,
  fallbackTaskType?: string,
): ReviewPackageActivityContent | null {
  const reviewPackageId = payload.reviewPackageId
  if (typeof reviewPackageId !== 'string' || reviewPackageId.length === 0) {
    return null
  }
  const fieldKeys = Array.isArray(payload.fieldKeys)
    ? payload.fieldKeys.filter((key): key is string => typeof key === 'string')
    : []
  const taskId =
    typeof payload.taskId === 'string' && payload.taskId.length > 0
      ? payload.taskId
      : fallbackTaskId
  const taskType =
    typeof payload.createdTaskType === 'string' && payload.createdTaskType.length > 0
      ? payload.createdTaskType
      : typeof payload.taskType === 'string' && payload.taskType.length > 0
        ? payload.taskType
        : fallbackTaskType
  return {
    reviewPackageId,
    fieldKeys,
    ...(taskId ? { taskId } : {}),
    ...(taskType ? { taskType } : {}),
  }
}

function searchRouteTemplatesFromPayload(
  payload: Record<string, unknown>,
): SearchRouteTemplatesActivityContent | null {
  const raw = payload.searchRouteTemplates
  if (!raw || typeof raw !== 'object' || !('items' in raw) || !Array.isArray(raw.items)) {
    return null
  }
  const items = raw.items.flatMap((item) => {
    if (!item || typeof item !== 'object') {
      return []
    }
    const record = item as Record<string, unknown>
    if (
      typeof record.id !== 'string' ||
      typeof record.name !== 'string' ||
      typeof record.defaultDayCount !== 'number' ||
      typeof record.usageCount !== 'number'
    ) {
      return []
    }
    return [
      {
        id: record.id,
        name: record.name,
        defaultDayCount: record.defaultDayCount,
        usageCount: record.usageCount,
        matchReasons: Array.isArray(record.matchReasons)
          ? record.matchReasons.filter(
              (reason): reason is Record<string, unknown> =>
                Boolean(reason) && typeof reason === 'object',
            )
          : [],
      },
    ]
  })
  return { items }
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

export type LiveAssistantSnapshot = Omit<AssistantSnapshotFrame, 'type'>

export type ProjectConversationFrameInput = {
  events: AiConversationEventView[]
  pendingText: string | null
  activeBatch?: AiInputBatchView | null
  pendingUploadCount?: number
  liveAssistant?: LiveAssistantSnapshot | null
  sessionReasoning?: Record<string, string>
}

export function isCopilotChatRunning(
  events: AiConversationEventView[],
  activeBatch: AiInputBatchView | null,
  pendingText: string | null,
  liveAssistant?: LiveAssistantSnapshot | null,
): boolean {
  if (pendingText) {
    return true
  }
  if (liveAssistant && shouldProjectLiveAssistant(events, liveAssistant)) {
    return true
  }
  const status = latestBatchStatus(events, activeBatch)
  if (status === 'waiting_for_materials') {
    const failed = latestFailedCount(events, activeBatch)
    return failed === 0
  }
  return status !== null && RUNNING_BATCH_STATUSES.has(status as AiInputBatchStatus)
}

/** Composer 停止对应的当前 InputBatch；无进行中批次时返回 null。 */
export function currentStoppableBatchId(
  events: AiConversationEventView[],
  activeBatch: AiInputBatchView | null = null,
): string | null {
  const status = latestBatchStatus(events, activeBatch)
  if (status === 'waiting_for_materials' && latestFailedCount(events, activeBatch) > 0) {
    return null
  }
  if (!status || !RUNNING_BATCH_STATUSES.has(status as AiInputBatchStatus)) {
    return null
  }
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    if (event.kind !== 'batch_status') {
      continue
    }
    return typeof event.payload.batchId === 'string' ? event.payload.batchId : null
  }
  return activeBatch?.id ?? null
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
  const taskSlots = new Map<string, number>()
  const batchTaskIds = new Map<string, string>()
  const taskTitles = new Map<string, string>()
  const taskTypes = new Map<string, string>()
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
  const upsertTask = (content: AgentTaskActivityContent) => {
    const item: ChatMessage = {
      id: `agent-task-${content.taskId}`,
      role: 'activity',
      activityType: AGENT_TASK_ACTIVITY_TYPE,
      content,
    }
    const existing = taskSlots.get(content.taskId)
    if (existing != null) {
      messages[existing] = item
      return
    }
    taskSlots.set(content.taskId, messages.length)
    messages.push(item)
  }

  for (const event of events) {
    const batchId =
      typeof event.payload.batchId === 'string' ? event.payload.batchId : undefined
    const explicitTaskId =
      typeof event.payload.taskId === 'string' && event.payload.taskId.length > 0
        ? event.payload.taskId
        : typeof event.payload.createdTaskId === 'string' &&
            event.payload.createdTaskId.length > 0
          ? event.payload.createdTaskId
          : undefined
    if (batchId && explicitTaskId) {
      batchTaskIds.set(batchId, explicitTaskId)
    }
    const taskId = explicitTaskId ?? (batchId ? batchTaskIds.get(batchId) : undefined)
    if (taskId && typeof event.payload.createdTaskGoal === 'string') {
      taskTitles.set(taskId, event.payload.createdTaskGoal)
    }
    if (taskId && typeof event.payload.createdTaskType === 'string') {
      taskTypes.set(taskId, event.payload.createdTaskType)
    }
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
      const reviewNotice = reviewPackageFromPayload(
        event.payload,
        taskId,
        taskId ? taskTypes.get(taskId) : undefined,
      )
      if (reviewNotice) {
        messages.push({
          id: `review-${reviewNotice.reviewPackageId}`,
          role: 'activity',
          activityType: REVIEW_PACKAGE_ACTIVITY_TYPE,
          content: reviewNotice,
        })
      }
      const searchNotice = searchRouteTemplatesFromPayload(event.payload)
      if (searchNotice) {
        messages.push({
          id: `search-${event.sequence}`,
          role: 'activity',
          activityType: SEARCH_ROUTE_TEMPLATES_ACTIVITY_TYPE,
          content: searchNotice,
        })
      }
      continue
    }
    if (event.kind === 'error') {
      if (typeof event.payload.materialId === 'string') {
        continue
      }
      const errorCode =
        typeof event.payload.errorCode === 'string' ? event.payload.errorCode : undefined
      upsertStatus({
        label: failedBatchLabel(errorCode),
        batchId,
        showBatchRetryAction: true,
      })
      continue
    }
    if (event.kind === 'batch_status') {
      const payload = event.payload
      const status = String(payload.status ?? '')
      if (taskId) {
        const taskType = taskTypes.get(taskId)
        const descriptor = taskType
          ? registeredTaskDescriptors.findByTaskType(taskType)
          : DEPARTURE_CREATION_TASK_DESCRIPTOR
        upsertTask({
          taskId,
          title: taskTitles.get(taskId) ?? descriptor?.defaultTitle ?? DEPARTURE_CREATION_TASK_DESCRIPTOR.defaultTitle,
          status,
          ...(taskType ? { taskType } : {}),
        })
      }
      const progress = progressFromPayload(payload)
      const errorCode =
        typeof payload.errorCode === 'string' ? payload.errorCode : undefined
      const label = batchStatusLabel(status, progress, {
        queued: payload.queued === true,
        reason: typeof payload.reason === 'string' ? payload.reason : undefined,
        disposition:
          typeof payload.disposition === 'string' ? payload.disposition : undefined,
        errorCode,
      })
      if (label) {
        const failedMaterials = failedMaterialsFromPayload(payload)
        upsertStatus({
          label,
          batchId,
          failedMaterials,
          showMaterialActions: status === 'waiting_for_materials' && failedMaterials.length > 0,
          showBatchRetryAction: status === 'failed',
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
        showBatchRetryAction: activeBatch.status === 'failed',
      })
    }
  }
  return messages
}

function currentInFlightAttempt(events: AiConversationEventView[]): {
  attemptId?: string
  generation?: number
} | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    if (event.kind !== 'batch_status') {
      continue
    }
    const status = String(event.payload.status ?? '')
    if (
      status === 'ready_for_agent' ||
      status === 'preparing_context' ||
      status === 'agent_running' ||
      status === 'waiting_for_materials'
    ) {
      return {
        attemptId:
          typeof event.payload.attemptId === 'string' ? event.payload.attemptId : undefined,
        generation:
          typeof event.payload.generation === 'number' ? event.payload.generation : undefined,
      }
    }
    return null
  }
  return null
}

export function shouldProjectLiveAssistant(
  events: AiConversationEventView[],
  live: LiveAssistantSnapshot,
): boolean {
  if (!live.text && !live.reasoningText) {
    return false
  }
  if (
    events.some(
      (event) =>
        event.kind === 'agent_message' && event.payload.attemptId === live.attemptId,
    )
  ) {
    return false
  }
  if (isFailedOrCancelledAttempt(events, live.attemptId)) {
    return false
  }
  if (isLiveClearedByTerminalBatch(events, live)) {
    return false
  }
  const inFlight = currentInFlightAttempt(events)
  if (typeof inFlight?.generation === 'number' && live.generation > inFlight.generation) {
    return true
  }
  if (typeof inFlight?.generation === 'number' && live.generation < inFlight.generation) {
    return false
  }
  if (inFlight?.attemptId && inFlight.attemptId !== live.attemptId) {
    return false
  }
  return true
}

function isLiveClearedByTerminalBatch(
  events: AiConversationEventView[],
  live: LiveAssistantSnapshot,
): boolean {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    if (event.kind !== 'batch_status') {
      continue
    }
    const status = String(event.payload.status ?? '')
    if (RUNNING_BATCH_STATUSES.has(status as AiInputBatchStatus)) {
      return false
    }
    if (status !== 'failed' && status !== 'cancelled' && status !== 'completed') {
      return false
    }
    const attemptId =
      typeof event.payload.attemptId === 'string' ? event.payload.attemptId : undefined
    const batchId = typeof event.payload.batchId === 'string' ? event.payload.batchId : undefined
    if (attemptId && attemptId === live.attemptId) {
      return true
    }
    if (batchId && batchId === live.batchId) {
      return true
    }
    return false
  }
  return false
}

export function isFailedOrCancelledAttempt(
  events: AiConversationEventView[],
  attemptId: string,
): boolean {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    if (event.kind !== 'batch_status' || event.payload.attemptId !== attemptId) {
      continue
    }
    const status = String(event.payload.status ?? '')
    return status === 'failed' || status === 'cancelled'
  }
  return false
}

export function pruneSessionReasoning(
  events: AiConversationEventView[],
  stash: Record<string, string>,
): Record<string, string> {
  const next: Record<string, string> = {}
  for (const [attemptId, text] of Object.entries(stash)) {
    if (text && !isFailedOrCancelledAttempt(events, attemptId)) {
      next[attemptId] = text
    }
  }
  return next
}

function reasoningMessage(attemptId: string, content: string): ChatMessage {
  return {
    id: `live-reasoning-${attemptId}`,
    role: 'reasoning',
    content,
  }
}

function injectSessionReasoning(
  messages: ChatMessage[],
  events: AiConversationEventView[],
  sessionReasoning: Record<string, string>,
): ChatMessage[] {
  const result = [...messages]
  for (const event of events) {
    if (event.kind !== 'agent_message') {
      continue
    }
    const attemptId =
      typeof event.payload.attemptId === 'string' ? event.payload.attemptId : undefined
    if (!attemptId) {
      continue
    }
    const text = sessionReasoning[attemptId]
    if (!text || isFailedOrCancelledAttempt(events, attemptId)) {
      continue
    }
    const assistantId = `event-${event.sequence}`
    const index = result.findIndex((message) => message.id === assistantId)
    if (index < 0) {
      continue
    }
    const already = result[index - 1]?.id === `live-reasoning-${attemptId}`
    if (already) {
      continue
    }
    result.splice(index, 0, reasoningMessage(attemptId, text))
  }
  return result
}

/** 统一会话壳最高可见投影：持久事件 + 当前 Attempt 即时输出。 */
export function projectConversationFrame(input: ProjectConversationFrameInput): ChatMessage[] {
  const messages = toCopilotChatMessages(
    input.events,
    input.pendingText,
    input.activeBatch ?? null,
    input.pendingUploadCount ?? 0,
  )
  const sessionReasoning = pruneSessionReasoning(input.events, input.sessionReasoning ?? {})
  const withHistory = injectSessionReasoning(messages, input.events, sessionReasoning)
  const live = input.liveAssistant
  if (!live || !shouldProjectLiveAssistant(input.events, live)) {
    return withHistory
  }
  const liveParts: ChatMessage[] = []
  if (live.reasoningText) {
    liveParts.push(reasoningMessage(live.attemptId, live.reasoningText))
  }
  if (live.text) {
    liveParts.push({
      id: `live-assistant-${live.attemptId}`,
      role: 'assistant',
      content: live.text,
    })
  }
  return [...withHistory, ...liveParts]
}
