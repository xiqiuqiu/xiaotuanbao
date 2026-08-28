import type {
  AiCreateAssistTaskStatus,
  AiInputBatchStatus,
  DepartureMaterialView,
} from '@xiaotuanbao/shared'

/** 解析 / Agent 在途时的刷新间隔。空闲对话框不得使用这个节奏。 */
export const ASSIST_ACTIVE_POLL_MS = 2_500
export const MATERIALS_WAITING_POLL_MS = 2_000
export const CONVERSATION_ACTIVE_CATCH_UP_MS = 2_500
export const CONVERSATION_IDLE_CATCH_UP_MS = 15_000
export const CONVERSATION_ERROR_CATCH_UP_DEBOUNCE_MS = 1_000

const MATERIAL_WAITING = new Set<DepartureMaterialView['status']>([
  'queued',
  'uploaded',
  'parsing',
])

const IN_FLIGHT_ASSIST = new Set<AiCreateAssistTaskStatus>([
  'parsing',
  'ai_processing',
  'awaiting_review',
])

const IN_FLIGHT_BATCH = new Set<AiInputBatchStatus>([
  'waiting_for_materials',
  'ready_for_agent',
  'preparing_context',
  'agent_running',
])

export function materialsRefetchInterval(
  items: DepartureMaterialView[] | undefined,
): number | false {
  if (!items?.length) {
    return false
  }
  return items.some((item) => MATERIAL_WAITING.has(item.status))
    ? MATERIALS_WAITING_POLL_MS
    : false
}

export function assistStateRefetchInterval(
  status: AiCreateAssistTaskStatus | undefined,
): number | false {
  if (!status || status === 'awaiting_review' || !IN_FLIGHT_ASSIST.has(status)) {
    return false
  }
  return ASSIST_ACTIVE_POLL_MS
}

export function taskReviewRefetchInterval(args: {
  paneOpen: boolean
  hasPendingReview: boolean
  assistStatus?: AiCreateAssistTaskStatus
}): number | false {
  if (!args.paneOpen) {
    return false
  }
  if (args.hasPendingReview || (args.assistStatus && IN_FLIGHT_ASSIST.has(args.assistStatus))) {
    return ASSIST_ACTIVE_POLL_MS
  }
  return false
}

export function conversationCatchUpIntervalMs(
  batchStatus: AiInputBatchStatus | null | undefined,
): number {
  if (batchStatus && IN_FLIGHT_BATCH.has(batchStatus)) {
    return CONVERSATION_ACTIVE_CATCH_UP_MS
  }
  return CONVERSATION_IDLE_CATCH_UP_MS
}
