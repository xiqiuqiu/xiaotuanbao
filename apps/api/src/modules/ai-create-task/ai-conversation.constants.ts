export const SEND_TEXT_OPERATION = 'ai-conversation.send-text'
export const RETRY_FAILED_MATERIALS_OPERATION = 'ai-conversation.retry-failed-materials'
export const REMOVE_BATCH_MATERIALS_OPERATION = 'ai-conversation.remove-materials'
export const ABANDON_BATCH_OPERATION = 'ai-conversation.abandon-batch'
export const STOP_BATCH_OPERATION = 'ai-conversation.stop-batch'
export const CANCEL_INTERACTION_OPERATION = 'ai-conversation.cancel-interaction'
export const REVIEW_ALREADY_HANDLED_MESSAGE = '审核包已处理'

/** 同一会话中仍会占用 Worker 的在途批次上限（排队 + 执行中，不含等待用户的暂停态）。 */
export const MAX_IN_FLIGHT_PROCESSING_BATCHES_PER_CONVERSATION = 3

/** 同一 User 在组织内仍会占用 Worker 的在途批次上限。 */
export const MAX_IN_FLIGHT_PROCESSING_BATCHES_PER_USER = 8

export const PLAINTEXT_CONTEXT_BUILDER_VERSION = 'ai-create-plaintext/v3'
export const PLAINTEXT_SYSTEM_PROMPT_VERSION = 'ai-create-readonly-assist/v3'
export const PLAINTEXT_TOOL_SCHEMA_VERSION = 'ai-create-tools/v3'
export const WORKFLOW_LEASE_MS = 120_000
/** 租约过期后最多再执行的次数；超出则失败并释放 `agent_running`，避免毒任务永久占锁。 */
export const WORKFLOW_MAX_ATTEMPTS = 5
export const SSE_CATCH_UP_POLL_MS = 400
