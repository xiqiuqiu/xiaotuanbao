import { createHash } from 'node:crypto'
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
