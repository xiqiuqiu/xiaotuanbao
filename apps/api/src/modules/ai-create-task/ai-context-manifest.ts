import { createHash } from 'node:crypto'
import type { ConversationEventForAgent, MaterialParseIndexItem } from '@xiaotuanbao/ai-contracts'
import {
  AI_CONVERSATION_EVENT_KINDS,
  FROZEN_PROJECTION_TAIL_EVENT_LIMIT,
} from '@xiaotuanbao/ai-contracts'
import {
  PLAINTEXT_CONTEXT_BUILDER_VERSION,
  PLAINTEXT_SYSTEM_PROMPT_VERSION,
  PLAINTEXT_TOOL_SCHEMA_VERSION,
  REVIEW_CONFIRM_CONTINUATION_TEXT,
} from './ai-conversation.constants'
import type { ContextBudgetRecord, ContextSectionUsage } from './ai-context-budget'

export interface ExcerptDigest {
  materialId: string
  parseResultVersion: number
  sha256: string
}

export interface FrozenContextProjection {
  conversationBackground: { summary: string | null; summaryVersion: number | null }
  recentTail: ConversationEventForAgent[]
  pinnedMaterials: MaterialParseIndexItem[]
  truncationReasons: string[]
}

export interface ContextManifestInput {
  conversationId: string
  inputBatchId: string
  conversationVersion: number
  eventSequences: number[]
  businessSnapshotVersion: number
  taskRefs?: Array<{
    taskId: string
    role: 'primary' | 'referenced' | 'created'
    goalVersion: number
    statusVersion: number
  }>
  modelId: string
  materialVersions: Array<{ materialId: string; parseResultVersion: number }>
  sourceVersions?: Array<{ sourceId: string; parseVersion: number; contentDigest: string }>
  excerptDigests: ExcerptDigest[]
  truncationReasons?: string[]
  inputHash: string
  budget: ContextBudgetRecord
  sections: ContextSectionUsage[]
  summaryVersion?: number | null
  sourceIndexVersion?: number | null
}

export interface ContextManifestRecord {
  conversationVersion: number
  eventSequences: number[]
  businessSnapshotVersion: number
  taskRefs: Array<{
    taskId: string
    role: 'primary' | 'referenced' | 'created'
    goalVersion: number
    statusVersion: number
  }>
  builderVersion: string
  systemPromptVersion: string
  toolSchemaVersion: string
  modelId: string
  inputHash: string
  truncationReasons: string[]
  summaryVersion: number | null
  sourceIndexVersion: number | null
  excerptDigests: ExcerptDigest[]
  materialVersions: Array<{ materialId: string; parseResultVersion: number }>
  sourceVersions: Array<{ sourceId: string; parseVersion: number; contentDigest: string }>
  budget: ContextBudgetRecord
  sections: ContextSectionUsage[]
}

export interface ConversationEventRecord {
  sequence: number
  kind: string
  payload: unknown
}

export function excludeRetractedQueueMessages(
  events: ConversationEventRecord[],
): ConversationEventRecord[] {
  const retractedSequences = new Set<number>()
  for (const event of events) {
    if (event.kind !== 'batch_status' || !event.payload || typeof event.payload !== 'object') {
      continue
    }
    const payload = event.payload as Record<string, unknown>
    if (
      payload.reason === 'queue_retracted' &&
      Number.isInteger(payload.retractedUserMessageSequence)
    ) {
      retractedSequences.add(payload.retractedUserMessageSequence as number)
    }
  }
  return events.filter((event) => !retractedSequences.has(event.sequence))
}

export function digestExcerpt(excerpt: string): string {
  return createHash('sha256').update(excerpt, 'utf8').digest('hex')
}

export function excerptDigestsFor(materials: MaterialParseIndexItem[]): ExcerptDigest[] {
  return materials
    .map((item) => ({
      materialId: item.materialId,
      parseResultVersion: item.parseResultVersion,
      sha256: digestExcerpt(item.excerpt),
    }))
    .sort(
      (left, right) =>
        left.materialId.localeCompare(right.materialId) ||
        left.parseResultVersion - right.parseResultVersion,
    )
}

export function buildContextManifest(input: ContextManifestInput): ContextManifestRecord {
  const truncationReasons = [...(input.truncationReasons ?? [])].sort()
  const materialVersions = [...input.materialVersions].sort(
    (left, right) =>
      left.materialId.localeCompare(right.materialId) ||
      left.parseResultVersion - right.parseResultVersion,
  )
  const sourceVersions = [...(input.sourceVersions ?? [])].sort(
    (left, right) =>
      left.sourceId.localeCompare(right.sourceId) || left.parseVersion - right.parseVersion,
  )
  const excerptDigests = [...input.excerptDigests].sort(
    (left, right) =>
      left.materialId.localeCompare(right.materialId) ||
      left.parseResultVersion - right.parseResultVersion,
  )
  return {
    conversationVersion: input.conversationVersion,
    eventSequences: input.eventSequences,
    businessSnapshotVersion: input.businessSnapshotVersion,
    taskRefs: [...(input.taskRefs ?? [])].sort(
      (left, right) => left.taskId.localeCompare(right.taskId) || left.role.localeCompare(right.role),
    ),
    builderVersion: PLAINTEXT_CONTEXT_BUILDER_VERSION,
    systemPromptVersion:
      sectionVersion(input.sections, 'system_constraints') ?? PLAINTEXT_SYSTEM_PROMPT_VERSION,
    toolSchemaVersion:
      sectionVersion(input.sections, 'tool_schemas') ?? PLAINTEXT_TOOL_SCHEMA_VERSION,
    modelId: input.modelId,
    inputHash: input.inputHash,
    truncationReasons,
    summaryVersion: input.summaryVersion ?? null,
    sourceIndexVersion: input.sourceIndexVersion ?? null,
    excerptDigests,
    materialVersions,
    sourceVersions,
    budget: { ...input.budget },
    sections: input.sections.map((section) => ({ ...section })),
  }
}

/** @deprecated Use buildContextManifest */
export const buildPlaintextContextManifest = buildContextManifest

export function parseEventSequences(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.filter((item): item is number => Number.isInteger(item) && item > 0)
}

export function eventSequencesForModelInput(
  recentTail: ReadonlyArray<{ sequence: number }>,
  currentInputSourceSequence: number,
): number[] {
  return [...new Set([...recentTail.map((event) => event.sequence), currentInputSourceSequence])].sort(
    (left, right) => left - right,
  )
}

const CONTEXT_TAIL_KINDS = new Set(['user_message', 'agent_message'])

export function selectRecentTailEvents(
  events: ConversationEventRecord[],
  conversationVersion: number,
  originUserMessageSequence?: number,
  currentUserMessageSequence?: number,
  excludeSequences?: ReadonlySet<number>,
): ConversationEventRecord[] {
  return events
    .filter((event) => {
      if (event.sequence > conversationVersion || !CONTEXT_TAIL_KINDS.has(event.kind)) {
        return false
      }
      if (excludeSequences?.has(event.sequence)) {
        return false
      }
      if (event.kind === 'user_message' && event.sequence === currentUserMessageSequence) {
        return false
      }
      if (
        originUserMessageSequence != null &&
        event.kind === 'user_message' &&
        event.sequence > originUserMessageSequence
      ) {
        return false
      }
      return true
    })
    .slice(-FROZEN_PROJECTION_TAIL_EVENT_LIMIT)
}

/** @deprecated Use selectRecentTailEvents */
export const selectPlaintextContextEvents = selectRecentTailEvents

export function resolveAttemptUserText(
  originalUserText: string,
  versionEvent: { kind: string; payload: unknown } | null | undefined,
): string {
  if (isConfirmedReviewContinuation(versionEvent)) {
    return REVIEW_CONFIRM_CONTINUATION_TEXT
  }
  return originalUserText
}

export function isConfirmedReviewContinuation(
  versionEvent: { kind: string; payload: unknown } | null | undefined,
): boolean {
  if (versionEvent?.kind !== 'batch_status' || !versionEvent.payload) {
    return false
  }
  const payload = versionEvent.payload
  return (
    typeof payload === 'object' &&
    !Array.isArray(payload) &&
    'disposition' in payload &&
    payload.disposition === 'confirmed'
  )
}

function uniqueReasons(reasons: string[]): string[] {
  return [...new Set(reasons)].sort()
}

function sectionVersion(
  sections: ContextSectionUsage[],
  key: ContextSectionUsage['key'],
): string | undefined {
  return sections.find((section) => section.key === key)?.version ?? undefined
}

export function buildFrozenProjection(input: {
  events: ConversationEventRecord[]
  conversationVersion: number
  originUserMessageSequence?: number
  currentUserMessageSequence?: number
  materials: MaterialParseIndexItem[]
  materialTruncationReasons?: string[]
  compaction?: {
    summary: string
    summaryVersion: number
    coveredEventSequences: readonly number[]
  } | null
}): FrozenContextProjection {
  const selected = selectRecentTailEvents(
    input.events,
    input.conversationVersion,
    input.originUserMessageSequence,
    input.currentUserMessageSequence,
    input.compaction ? new Set(input.compaction.coveredEventSequences) : undefined,
  )
  return {
    conversationBackground: input.compaction
      ? {
          summary: input.compaction.summary,
          summaryVersion: input.compaction.summaryVersion,
        }
      : { summary: null, summaryVersion: null },
    recentTail: projectConversationEventsForAgent(selected),
    pinnedMaterials: input.materials.map((item) => ({ ...item })),
    truncationReasons: uniqueReasons(input.materialTruncationReasons ?? []),
  }
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
  const text = conversationEventText(payload)
  return text ? text : undefined
}

export function conversationEventText(payload: unknown): string {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || !('text' in payload)) {
    return ''
  }
  const text = (payload as { text: unknown }).text
  return typeof text === 'string' && text.trim() ? text.trim() : ''
}
