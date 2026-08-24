export const SEND_TEXT_OPERATION = 'ai-conversation.send-text'
export const RETRY_FAILED_MATERIALS_OPERATION = 'ai-conversation.retry-failed-materials'
export const RETRY_FAILED_BATCH_OPERATION = 'ai-conversation.retry-failed-batch'
export const REMOVE_BATCH_MATERIALS_OPERATION = 'ai-conversation.remove-materials'
export const ABANDON_BATCH_OPERATION = 'ai-conversation.abandon-batch'
export const STOP_BATCH_OPERATION = 'ai-conversation.stop-batch'
export const CANCEL_INTERACTION_OPERATION = 'ai-conversation.cancel-interaction'
export const REVIEW_ALREADY_HANDLED_MESSAGE = '审核包已处理'

/** 确认后续跑喂给模型的本轮原文；不写入 User 消息气泡。 */
export const REVIEW_CONFIRM_CONTINUATION_TEXT =
  'User 已在中间表单确认上一轮审核建议。请调用 getTaskContext 读取最新草稿，简短说明已写入字段，只问一个当前阶段仍缺少的问题。不要再次提交已经写入草稿的字段。'

/** 同一会话中仍会占用 Worker 的在途批次上限（排队 + 执行中，不含等待用户的暂停态）。 */
export const MAX_IN_FLIGHT_PROCESSING_BATCHES_PER_CONVERSATION = 3

/** 同一 User 在组织内仍会占用 Worker 的在途批次上限。 */
export const MAX_IN_FLIGHT_PROCESSING_BATCHES_PER_USER = 8

export const PLAINTEXT_CONTEXT_BUILDER_VERSION = 'ai-create-frozen-projection/v1'
export const PLAINTEXT_SYSTEM_PROMPT_VERSION = 'ai-create-readonly-assist/v6'
export const PLAINTEXT_TOOL_SCHEMA_VERSION = 'ai-create-tools/v6'
export const CONVERSATION_EVENTS_PAGE_SIZE = 100
export const WORKFLOW_LEASE_MS = 120_000
export const WORKFLOW_HEARTBEAT_MS = 30_000
export const WORKFLOW_PARSE_CONCURRENCY = 2
export const WORKFLOW_AGENT_CONCURRENCY = 2
/** 租约过期后最多再执行的次数；超出则失败并释放 `agent_running`，避免毒任务永久占锁。 */
export const WORKFLOW_MAX_ATTEMPTS = 5
export const WORKFLOW_RETRY_BACKOFF_MS = [5_000, 10_000, 20_000, 40_000, 60_000] as const
export const WORKFLOW_IMMEDIATE_FAILURE_CODES = new Set([
  'PERMISSION_DENIED',
  'VERSION_CONFLICT',
  'BATCH_CANCELLED',
])

export function workflowBackoffMs(attemptCount: number): number {
  const index = Math.min(Math.max(attemptCount, 1), WORKFLOW_RETRY_BACKOFF_MS.length) - 1
  return WORKFLOW_RETRY_BACKOFF_MS[index] ?? WORKFLOW_RETRY_BACKOFF_MS[WORKFLOW_RETRY_BACKOFF_MS.length - 1]
}

export function isImmediateWorkflowFailure(errorCode: string): boolean {
  return WORKFLOW_IMMEDIATE_FAILURE_CODES.has(errorCode)
}

/** Worker 与 API 分进程时内存 hub 收不到完成事件，按 sequence 轮询补读。 */
export const SSE_CATCH_UP_POLL_MS = 400
/** 空闲 SSE 连接拉长补读间隔，避免每个打开的对话框都按 400ms 打库。 */
export const SSE_CATCH_UP_IDLE_POLL_MS = 5_000

export function nextSseCatchUpDelay(foundEvents: boolean): number {
  return foundEvents ? SSE_CATCH_UP_POLL_MS : SSE_CATCH_UP_IDLE_POLL_MS
}
