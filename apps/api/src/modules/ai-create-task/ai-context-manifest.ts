import { createHash } from 'node:crypto'
import type { ConversationEventForAgent, MaterialParseIndexItem } from '@xiaotuanbao/ai-contracts'
import {
  AGENT_MESSAGE_DROPPED_TRUNCATION,
  AI_CONVERSATION_EVENT_KINDS,
  FROZEN_PROJECTION_TAIL_EVENT_LIMIT,
  FROZEN_PROJECTION_TOTAL_CHARS,
  PINNED_PARSE_CONTEXT_PREFACE,
  PROJECTION_TOTAL_CHARS_TRUNCATION,
  clipExcerpt,
} from '@xiaotuanbao/ai-contracts'
import {
  PLAINTEXT_CONTEXT_BUILDER_VERSION,
  PLAINTEXT_SYSTEM_PROMPT_VERSION,
  PLAINTEXT_TOOL_SCHEMA_VERSION,
  REVIEW_CONFIRM_CONTINUATION_TEXT,
} from './ai-conversation.constants'

export interface ExcerptDigest {
  materialId: string
  parseResultVersion: number
  sha256: string
}

export interface FrozenContextProjection {
  conversationBackground: { summary: null; summaryVersion: null }
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
  modelId: string
  materialVersions: Array<{ materialId: string; parseResultVersion: number }>
  excerptDigests: ExcerptDigest[]
  truncationReasons?: string[]
}

export interface ContextManifestRecord {
  conversationVersion: number
  eventSequences: number[]
  businessSnapshotVersion: number
  builderVersion: string
  systemPromptVersion: string
  toolSchemaVersion: string
  modelId: string
  inputHash: string
  truncationReasons: string[]
  summaryVersion: null
  excerptDigests: ExcerptDigest[]
  materialVersions: Array<{ materialId: string; parseResultVersion: number }>
}

export interface ConversationEventRecord {
  sequence: number
  kind: string
  payload: unknown
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
  const excerptDigests = [...input.excerptDigests].sort(
    (left, right) =>
      left.materialId.localeCompare(right.materialId) ||
      left.parseResultVersion - right.parseResultVersion,
  )
  const canonical = {
    conversationId: input.conversationId,
    inputBatchId: input.inputBatchId,
    conversationVersion: input.conversationVersion,
    eventSequences: input.eventSequences,
    materialVersions,
    excerptDigests,
    businessSnapshotVersion: input.businessSnapshotVersion,
    summaryVersion: null,
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
    summaryVersion: null,
    excerptDigests,
    materialVersions,
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

const CONTEXT_TAIL_KINDS = new Set(['user_message', 'agent_message'])

export function selectRecentTailEvents(
  events: ConversationEventRecord[],
  conversationVersion: number,
  originUserMessageSequence?: number,
): ConversationEventRecord[] {
  return events
    .filter((event) => {
      if (event.sequence > conversationVersion || !CONTEXT_TAIL_KINDS.has(event.kind)) {
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
  if (versionEvent?.kind !== 'batch_status' || !versionEvent.payload) {
    return originalUserText
  }
  const payload = versionEvent.payload
  if (
    typeof payload === 'object' &&
    !Array.isArray(payload) &&
    'disposition' in payload &&
    payload.disposition === 'confirmed'
  ) {
    return REVIEW_CONFIRM_CONTINUATION_TEXT
  }
  return originalUserText
}

function uniqueReasons(reasons: string[]): string[] {
  return [...new Set(reasons)].sort()
}

function projectionCharCount(
  tail: ConversationEventForAgent[],
  materials: MaterialParseIndexItem[],
): number {
  const tailChars = tail.reduce((sum, event) => sum + (event.text?.length ?? 0), 0)
  const excerptChars = materials.reduce((sum, item) => sum + item.excerpt.length, 0)
  return tailChars + excerptChars
}

export function applyFrozenProjectionBudget(
  tail: ConversationEventForAgent[],
  materials: MaterialParseIndexItem[],
  originUserMessageSequence?: number,
): { recentTail: ConversationEventForAgent[]; pinnedMaterials: MaterialParseIndexItem[]; truncationReasons: string[] } {
  const reasons: string[] = []
  let recentTail = [...tail]
  let pinnedMaterials = materials.map((item) => ({ ...item }))

  const dropOldestAgent = (): boolean => {
    const index = recentTail.findIndex(
      (event) =>
        event.kind === 'agent_message' &&
        (originUserMessageSequence == null || event.sequence !== originUserMessageSequence),
    )
    if (index < 0) {
      return false
    }
    recentTail = recentTail.filter((_, itemIndex) => itemIndex !== index)
    return true
  }

  while (
    projectionCharCount(recentTail, pinnedMaterials) > FROZEN_PROJECTION_TOTAL_CHARS &&
    dropOldestAgent()
  ) {
    reasons.push(AGENT_MESSAGE_DROPPED_TRUNCATION)
  }

  if (projectionCharCount(recentTail, pinnedMaterials) > FROZEN_PROJECTION_TOTAL_CHARS) {
    const tailChars = recentTail.reduce((sum, event) => sum + (event.text?.length ?? 0), 0)
    let remaining = Math.max(0, FROZEN_PROJECTION_TOTAL_CHARS - tailChars)
    pinnedMaterials = pinnedMaterials.map((item) => {
      const clipped = clipExcerpt(item.excerpt, remaining)
      remaining = Math.max(0, remaining - clipped.excerpt.length)
      return {
        ...item,
        excerpt: clipped.excerpt,
        truncated: item.truncated || clipped.truncated,
      }
    })
    reasons.push(PROJECTION_TOTAL_CHARS_TRUNCATION)
  }

  return {
    recentTail,
    pinnedMaterials,
    truncationReasons: uniqueReasons(reasons),
  }
}

export function buildFrozenProjection(input: {
  events: ConversationEventRecord[]
  conversationVersion: number
  originUserMessageSequence?: number
  materials: MaterialParseIndexItem[]
  materialTruncationReasons?: string[]
}): FrozenContextProjection {
  const selected = selectRecentTailEvents(
    input.events,
    input.conversationVersion,
    input.originUserMessageSequence,
  )
  const budgeted = applyFrozenProjectionBudget(
    projectConversationEventsForAgent(selected),
    input.materials,
    input.originUserMessageSequence,
  )
  return {
    conversationBackground: { summary: null, summaryVersion: null },
    recentTail: budgeted.recentTail,
    pinnedMaterials: budgeted.pinnedMaterials,
    truncationReasons: uniqueReasons([
      ...(input.materialTruncationReasons ?? []),
      ...budgeted.truncationReasons,
    ]),
  }
}

function formatTail(events: ConversationEventForAgent[]): string {
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
  return lines.length > 0 ? lines.join('\n') : '（无）'
}

function formatMaterials(materials: MaterialParseIndexItem[]): string {
  if (materials.length === 0) {
    return '（无）'
  }
  const blocks = materials.map((item) => {
    const clip = item.truncated ? '，摘录已裁剪' : ''
    const excerpt = item.excerpt.trim() ? `\n摘录：${item.excerpt}` : ''
    return `资料 ${item.materialId}（解析版本 ${item.parseResultVersion}，已解析完成，共 ${item.pageCount} 页${clip}）${excerpt}`
  })
  return `${PINNED_PARSE_CONTEXT_PREFACE}\n\n${blocks.join('\n\n')}`
}

export function assembleFrozenUserText(
  currentUserText: string,
  projection: FrozenContextProjection,
): string {
  return [
    '【交流背景】',
    '本阶段无滚动摘要。',
    '',
    '【近期对话】',
    formatTail(projection.recentTail),
    '',
    '【本批资料】',
    formatMaterials(projection.pinnedMaterials),
    '',
    '【本轮指令】',
    currentUserText,
  ].join('\n')
}

export function composePlaintextUserText(
  currentUserText: string,
  events: ConversationEventForAgent[],
): string {
  return assembleFrozenUserText(currentUserText, {
    conversationBackground: { summary: null, summaryVersion: null },
    recentTail: events,
    pinnedMaterials: [],
    truncationReasons: [],
  })
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
