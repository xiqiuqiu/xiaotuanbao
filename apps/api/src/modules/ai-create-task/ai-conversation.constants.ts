export const SEND_TEXT_OPERATION = 'ai-conversation.send-text'

/** 同一会话中仍会占用 Worker 的在途批次上限（排队 + 执行中，不含等待用户的暂停态）。 */
export const MAX_IN_FLIGHT_PROCESSING_BATCHES_PER_CONVERSATION = 3

/** 同一 User 在组织内仍会占用 Worker 的在途批次上限。 */
export const MAX_IN_FLIGHT_PROCESSING_BATCHES_PER_USER = 8

export const PLAINTEXT_CONTEXT_BUILDER_VERSION = 'ai-create-plaintext/v1'
export const PLAINTEXT_SYSTEM_PROMPT_VERSION = 'ai-create-readonly-assist/v1'
export const PLAINTEXT_TOOL_SCHEMA_VERSION = 'ai-create-tools/v1'
export const WORKFLOW_LEASE_MS = 120_000
export const SSE_CATCH_UP_POLL_MS = 400
