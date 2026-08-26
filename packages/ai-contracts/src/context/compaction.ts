import { clipExcerpt } from './material-parse-index'
import { sha256Hex } from './sha256'

export const CONTEXT_COMPACTION_POLICY_VERSION = 'deterministic-event-index/v1'
export const CONTEXT_COMPACTION_CONFIG_VERSION = 'locator-excerpt-80/v1'
export const CONTEXT_COMPACTION_MODEL_ID = 'deterministic'
export const CONTEXT_COMPACTION_EXCERPT_CHARS = 80
export const CONTEXT_COMPACTION_KEEP_TAIL = 8
export const CONTEXT_COMPACTION_BUFFER_RATIO = 0.5
export const CONTEXT_COMPACTION_ACTIVATE_RATIO = 0.8
export const CONTEXT_COMPACTION_DISCLAIMER =
  '本摘要不是业务事实、授权或候选证据。当前业务事实与未决交互以实时权威区段为准。原文须按 locator 回读。'

export const COMPACTABLE_EVENT_KINDS = ['user_message', 'agent_message'] as const

export type ConversationEventLocator = {
  kind: 'conversation_event'
  conversationId: string
  sequence: number
  eventKind: string
  contentDigest: string
  charRange: { start: number; end: number }
}

export type ConversationSourceLocator = {
  kind: 'conversation_source'
  conversationId: string
  sourceId: string
  parseVersion: number
  pageNumber: number | null
  contentDigest: string
}

export type CompactionInputEvent = {
  sequence: number
  kind: string
  text: string
}

export type ContextCompactionVersionRecord = {
  policyVersion: string
  configVersion: string
  modelId: string
  conversationVersionCeiling: number
  coveredSequenceStart: number
  coveredSequenceEnd: number
  coveredEventSequences: number[]
  locators: ConversationEventLocator[]
  summary: string
  digest: string
  inputDigest: string
}

export function selectCompactableEvents(
  events: readonly CompactionInputEvent[],
  conversationVersion: number,
  currentUserMessageSequence?: number,
): CompactionInputEvent[] {
  return events
    .filter((event) => {
      if (event.sequence > conversationVersion) {
        return false
      }
      if (currentUserMessageSequence != null && event.sequence === currentUserMessageSequence) {
        return false
      }
      return (COMPACTABLE_EVENT_KINDS as readonly string[]).includes(event.kind)
    })
    .sort((left, right) => left.sequence - right.sequence)
}

export function splitCompactionWindow(events: readonly CompactionInputEvent[]): {
  compact: CompactionInputEvent[]
  keepTail: CompactionInputEvent[]
} {
  if (events.length <= CONTEXT_COMPACTION_KEEP_TAIL) {
    return { compact: [], keepTail: [...events] }
  }
  return {
    compact: events.slice(0, events.length - CONTEXT_COMPACTION_KEEP_TAIL),
    keepTail: events.slice(events.length - CONTEXT_COMPACTION_KEEP_TAIL),
  }
}

export function compactConversationEvents(input: {
  conversationId: string
  conversationVersion: number
  currentUserMessageSequence?: number
  events: readonly CompactionInputEvent[]
  modelId?: string
}): ContextCompactionVersionRecord | null {
  const compactable = selectCompactableEvents(
    input.events,
    input.conversationVersion,
    input.currentUserMessageSequence,
  )
  const { compact } = splitCompactionWindow(compactable)
  if (compact.length === 0) {
    return null
  }
  return buildCompactionVersion({
    conversationId: input.conversationId,
    conversationVersion: input.conversationVersion,
    events: compact,
    modelId: input.modelId ?? CONTEXT_COMPACTION_MODEL_ID,
  })
}

export function buildCompactionVersion(input: {
  conversationId: string
  conversationVersion: number
  events: readonly CompactionInputEvent[]
  modelId: string
}): ContextCompactionVersionRecord {
  const events = [...input.events].sort((left, right) => left.sequence - right.sequence)
  const locators = events.map((event) => eventLocatorFor(input.conversationId, event))
  const summary = renderCompactionSummary(events, locators)
  const coveredEventSequences = events.map((event) => event.sequence)
  const body = {
    policyVersion: CONTEXT_COMPACTION_POLICY_VERSION,
    configVersion: CONTEXT_COMPACTION_CONFIG_VERSION,
    modelId: input.modelId,
    conversationVersionCeiling: input.conversationVersion,
    coveredSequenceStart: events[0]?.sequence ?? 0,
    coveredSequenceEnd: events.at(-1)?.sequence ?? 0,
    coveredEventSequences,
    locators,
    summary,
  }
  return {
    ...body,
    digest: sha256(stableJson(body)),
    inputDigest: sha256(
      stableJson(
        events.map((event) => ({
          sequence: event.sequence,
          kind: event.kind,
          text: event.text,
        })),
      ),
    ),
  }
}

export function eventLocatorFor(
  conversationId: string,
  event: CompactionInputEvent,
): ConversationEventLocator {
  return {
    kind: 'conversation_event',
    conversationId,
    sequence: event.sequence,
    eventKind: event.kind,
    contentDigest: sha256(event.text),
    charRange: { start: 0, end: event.text.length },
  }
}

export function coveredSequenceSet(
  version: Pick<ContextCompactionVersionRecord, 'coveredEventSequences'>,
): Set<number> {
  return new Set(version.coveredEventSequences)
}

function renderCompactionSummary(
  events: CompactionInputEvent[],
  locators: ConversationEventLocator[],
): string {
  const start = events[0]?.sequence ?? 0
  const end = events.at(-1)?.sequence ?? 0
  const lines = events.map((event, index) => {
    const locator = locators[index]
    const excerpt = clipExcerpt(event.text, CONTEXT_COMPACTION_EXCERPT_CHARS).excerpt
    return `- seq ${event.sequence} ${event.kind} digest=${locator?.contentDigest.slice(0, 12)} locator=conversation_event:${locator?.conversationId}:${event.sequence}\n  摘录：${excerpt}`
  })
  return [
    '【会话压缩摘要】',
    `覆盖事件 sequence ${start}–${end}（共 ${events.length} 条，locator 可回读原文）。`,
    CONTEXT_COMPACTION_DISCLAIMER,
    '',
    ...lines,
  ].join('\n')
}

function sha256(content: string): string {
  return sha256Hex(content)
}

function stableJson(value: unknown): string {
  return JSON.stringify(canonicalize(value))
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize)
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    )
  }
  return value
}
