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
  const truncationReasons: string[] = []
  const canonical = {
    conversationId: input.conversationId,
    inputBatchId: input.inputBatchId,
    conversationVersion: input.conversationVersion,
    eventSequences: input.eventSequences,
    userText: input.userText,
    businessSnapshotVersion: input.businessSnapshotVersion,
    materialVersions: input.materialVersions,
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
