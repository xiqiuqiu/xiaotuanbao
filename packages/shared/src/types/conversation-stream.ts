import type { AiConversationEventView } from './api.types'

export type AssistantSnapshotFrame = {
  type: 'assistant.snapshot'
  attemptId: string
  batchId: string
  generation: number
  revision: number
  reasoningText: string
  text: string
}

export type ConversationStreamFrame =
  | { type: 'conversation.event'; event: AiConversationEventView }
  | AssistantSnapshotFrame
  | { type: 'heartbeat' }

function isConversationEventView(value: unknown): value is AiConversationEventView {
  if (!value || typeof value !== 'object') {
    return false
  }
  const record = value as Record<string, unknown>
  return (
    typeof record.sequence === 'number' &&
    typeof record.kind === 'string' &&
    record.payload !== null &&
    typeof record.payload === 'object' &&
    typeof record.createdAt === 'string'
  )
}

function isAssistantSnapshotFrame(value: Record<string, unknown>): value is AssistantSnapshotFrame {
  return (
    value.type === 'assistant.snapshot' &&
    typeof value.attemptId === 'string' &&
    typeof value.batchId === 'string' &&
    typeof value.generation === 'number' &&
    typeof value.revision === 'number' &&
    typeof value.reasoningText === 'string' &&
    typeof value.text === 'string'
  )
}

/** 解析会话 SSE `data`。兼容本票前的裸事件 JSON，避免旧壳在协议切换时丢帧。 */
export function parseConversationStreamFrame(value: unknown): ConversationStreamFrame | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const record = value as Record<string, unknown>
  if (record.type === 'heartbeat') {
    return { type: 'heartbeat' }
  }
  if (record.type === 'assistant.snapshot') {
    return isAssistantSnapshotFrame(record) ? record : null
  }
  if (record.type === 'conversation.event') {
    return isConversationEventView(record.event)
      ? { type: 'conversation.event', event: record.event }
      : null
  }
  if (isConversationEventView(record)) {
    return { type: 'conversation.event', event: record }
  }
  return null
}
