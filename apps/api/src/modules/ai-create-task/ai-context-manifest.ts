import { createHash } from 'node:crypto'
import type { ConversationEventForAgent } from '@xiaotuanbao/ai-contracts'
import { AI_CONVERSATION_EVENT_KINDS } from '@xiaotuanbao/ai-contracts'
import {
  PLAINTEXT_CONTEXT_BUILDER_VERSION,
  PLAINTEXT_SYSTEM_PROMPT_VERSION,
  PLAINTEXT_TOOL_SCHEMA_VERSION,
} from './ai-conversation.constants'

export interface PlaintextContextInput {
  conversationId: string
  inputBatchId: string
  conversationVersion: number
  eventSequences: number[]
  userText: string
  businessSnapshotVersion: number
  modelId: string
  materialVersions: Array<{ materialId: string; parseResultVersion: number }>
  truncationReasons?: string[]
}

export interface PlaintextContextManifestRecord {
  conversationVersion: number
  eventSequences: number[]
  businessSnapshotVersion: number
  builderVersion: string
  systemPromptVersion: string
  toolSchemaVersion: string
  modelId: string
  inputHash: string
  truncationReasons: string[]
}

export interface ConversationEventRecord {
  sequence: number
  kind: string
  payload: unknown
}

export function buildPlaintextContextManifest(
  input: PlaintextContextInput,
): PlaintextContextManifestRecord {
  const truncationReasons = input.truncationReasons ?? []
  const canonical = {
    conversationId: input.conversationId,
    inputBatchId: input.inputBatchId,
    conversationVersion: input.conversationVersion,
    eventSequences: input.eventSequences,
    userText: input.userText,
    businessSnapshotVersion: input.businessSnapshotVersion,
    materialVersions: input.materialVersions,
    truncationReasons,
    builderVersion: PLAINTEXT_CONTEXT_BUILDER_VERSION,
    systemPromptVersion: PLAINTEXT_SYSTEM_PROMPT_VERSION,
    toolSchemaVersion: PLAINTEXT_TOOL_SCHEMA_VERSION,
    modelId: input.modelId,
  }
  return {
    conversationVersion: input.conversationVersion,
    eventSequences: input.eventSequences,
    businessSnapshotVersion: input.businessSnapshotVersion,
    builderVersion: PLAINTEXT_CONTEXT_BUILDER_VERSION,
    systemPromptVersion: PLAINTEXT_SYSTEM_PROMPT_VERSION,
    toolSchemaVersion: PLAINTEXT_TOOL_SCHEMA_VERSION,
    modelId: input.modelId,
    inputHash: createHash('sha256').update(JSON.stringify(canonical)).digest('hex'),
    truncationReasons,
  }
}

export function parseEventSequences(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.filter((item): item is number => Number.isInteger(item) && item > 0)
}

const PLAINTEXT_CONTEXT_TAIL_KINDS = new Set(['user_message', 'agent_message'])
const PLAINTEXT_CONTEXT_TAIL_LIMIT = 40

export function selectPlaintextContextEvents(
  events: ConversationEventRecord[],
  conversationVersion: number,
): ConversationEventRecord[] {
  return events
    .filter(
      (event) =>
        event.sequence <= conversationVersion && PLAINTEXT_CONTEXT_TAIL_KINDS.has(event.kind),
    )
    .slice(-PLAINTEXT_CONTEXT_TAIL_LIMIT)
}

export function composePlaintextUserText(
  currentUserText: string,
  events: ConversationEventForAgent[],
): string {
  const lines = events.flatMap((event) => {
    if (!event.text) {
      return []
    }
    if (event.kind === 'user_message') {
      return [`User: ${event.text}`]
    }
    if (event.kind === 'agent_message') {
      return [`Assistant: ${event.text}`]
    }
    return []
  })
  const currentLine = `User: ${currentUserText}`
  const lastLine = lines.at(-1)
  const prior = lastLine === currentLine ? lines.slice(0, -1) : lines
  if (prior.length === 0) {
    return currentUserText
  }
  return `以下是本会话近期对话，请在此基础上继续，不要忽略已经说过的内容。\n\n${prior.join('\n')}\n\n${currentLine}`
}

export function projectConversationEventsForAgent(
  events: ConversationEventRecord[],
): ConversationEventForAgent[] {
  const allowed = new Set<string>(AI_CONVERSATION_EVENT_KINDS)
  return events.flatMap((event) => {
    if (!allowed.has(event.kind)) {
      return []
    }
    const text = textFromPayload(event.payload)
    return [
      {
        sequence: event.sequence,
        kind: event.kind as ConversationEventForAgent['kind'],
        ...(text ? { text } : {}),
      },
    ]
  })
}

function textFromPayload(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || !('text' in payload)) {
    return undefined
  }
  const text = (payload as { text: unknown }).text
  return typeof text === 'string' && text.trim() ? text.trim() : undefined
}
