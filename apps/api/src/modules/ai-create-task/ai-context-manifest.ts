import { createHash } from 'node:crypto'
import type { ConversationEventForAgent } from '@xiaotuanbao/ai-contracts'
import { AI_CONVERSATION_EVENT_KINDS } from '@xiaotuanbao/ai-contracts'
import {
  PLAINTEXT_CONTEXT_BUILDER_VERSION,
  PLAINTEXT_SYSTEM_PROMPT_VERSION,
  PLAINTEXT_TOOL_SCHEMA_VERSION,
  REVIEW_CONFIRM_CONTINUATION_TEXT,
} from './ai-conversation.constants'

export interface PlaintextContextInput {
  conversationId: string
  inputBatchId: string
  conversationVersion: number
  eventSequences: readonly number[]
  userText: string
  businessSnapshotVersion: number
  taskStatus: string
  taskPhase: string
  businessSnapshot?: unknown
  authoritativeContext?: unknown
  materialContext?: ReadonlyArray<Record<string, unknown>>
  reviewSnapshot?: unknown
  availableCapabilities?: readonly string[]
  modelId: string
  materialVersions: ReadonlyArray<{ materialId: string; parseResultVersion: number }>
  materialFragmentRefs?: readonly string[]
  materialContentTokens?: number
  summaryId?: string | null
  summaryVersion?: number | null
  budgets?: PlaintextContextBudgets
  budgetUsage?: PlaintextContextBudgetUsage
  truncationReasons?: string[]
}

export interface PlaintextContextBudgets {
  summaryTokens: number
  recentTailTokens: number
  materialTokens: number
  totalTokens: number
  mediaItems: number
}

export interface PlaintextContextBudgetUsage {
  summaryTokens: number
  recentTailTokens: number
  materialTokens: number
  totalTokens: number
  mediaItems: number
}

export interface PlaintextContextManifestRecord {
  conversationVersion: number
  eventSequences: number[]
  businessSnapshotVersion: number
  taskStatus: string
  taskPhase: string
  businessSnapshot: unknown
  reviewSnapshot: unknown
  availableCapabilities: string[]
  summaryId: string | null
  summaryVersion: number | null
  materialFragmentRefs: string[]
  budgets: PlaintextContextBudgets
  budgetUsage: PlaintextContextBudgetUsage
  builderVersion: string
  systemPromptVersion: string
  toolSchemaVersion: string
  modelId: string
  inputHash: string
  truncationReasons: string[]
}

export const DEFAULT_PLAINTEXT_CONTEXT_BUDGETS: PlaintextContextBudgets = {
  summaryTokens: 800,
  recentTailTokens: 1_600,
  materialTokens: 2_400,
  totalTokens: 6_000,
  mediaItems: 0,
}

export class RequiredContextBudgetExceededError extends Error {
  readonly requiredTokens: number
  readonly totalTokens: number

  constructor(requiredTokens: number, totalTokens: number) {
    super(`权威上下文超出总预算：required=${requiredTokens}, total=${totalTokens}`)
    this.name = 'RequiredContextBudgetExceededError'
    this.requiredTokens = requiredTokens
    this.totalTokens = totalTokens
  }
}

export interface ConversationEventRecord {
  sequence: number
  kind: string
  payload: unknown
}

export interface RollingConversationSummaryRecord {
  version: number
  throughSequence: number
  text: string
  sourceEventSequences: number[]
}

/** 构建可复现的抽取式滚动摘要；只压缩早期原文，不生成新的业务事实。 */
export function buildRollingConversationSummary(
  existing: RollingConversationSummaryRecord | null,
  events: readonly ConversationEventRecord[],
  conversationVersion: number,
  options: {
    retainedTailEvents?: number
    originUserMessageSequence?: number
  } = {},
): (RollingConversationSummaryRecord & { truncated: boolean }) | null {
  const retainedTailEvents = options.retainedTailEvents ?? PLAINTEXT_CONTEXT_TAIL_LIMIT
  const originUserMessageSequence = options.originUserMessageSequence
  const eligible = events.filter(
    (event) =>
      event.sequence > (existing?.throughSequence ?? 0) &&
      event.sequence <= conversationVersion &&
      !(
        originUserMessageSequence != null &&
        event.kind === 'user_message' &&
        event.sequence > originUserMessageSequence
      ) &&
      PLAINTEXT_CONTEXT_TAIL_KINDS.has(event.kind) &&
      Boolean(textFromPayload(event.payload)),
  )
  const compacted = eligible.slice(0, Math.max(0, eligible.length - retainedTailEvents))
  if (compacted.length === 0) return existing ? { ...existing, truncated: false } : null

  const appended = compacted
    .map((event) => `- ${event.kind === 'user_message' ? 'User' : 'Assistant'}: ${textFromPayload(event.payload)}`)
    .join('\n')
  const combined = [existing?.text, appended].filter(Boolean).join('\n')
  const characters = [...combined]
  const maxTokens = DEFAULT_PLAINTEXT_CONTEXT_BUDGETS.summaryTokens
  const truncated = characters.length > maxTokens
  return {
    version: (existing?.version ?? 0) + 1,
    throughSequence: compacted.at(-1)?.sequence ?? existing?.throughSequence ?? 0,
    text: (truncated ? characters.slice(-maxTokens) : characters).join(''),
    sourceEventSequences: [
      ...(existing?.sourceEventSequences ?? []),
      ...compacted.map((event) => event.sequence),
    ],
    truncated,
  }
}

export function buildPlaintextContextManifest(
  input: PlaintextContextInput,
): PlaintextContextManifestRecord {
  const truncationReasons = input.truncationReasons ?? []
  const budgets = input.budgets ?? DEFAULT_PLAINTEXT_CONTEXT_BUDGETS
  const budgetUsage = input.budgetUsage ?? {
    summaryTokens: 0,
    recentTailTokens: estimatePlaintextTokens(input.userText),
    materialTokens: 0,
    totalTokens: estimatePlaintextTokens(input.userText),
    mediaItems: 0,
  }
  const canonical = {
    conversationId: input.conversationId,
    inputBatchId: input.inputBatchId,
    conversationVersion: input.conversationVersion,
    eventSequences: [...input.eventSequences],
    userText: input.userText,
    businessSnapshotVersion: input.businessSnapshotVersion,
    taskStatus: input.taskStatus,
    taskPhase: input.taskPhase,
    businessSnapshot: input.businessSnapshot ?? null,
    authoritativeContext: input.authoritativeContext ?? null,
    reviewSnapshot: input.reviewSnapshot ?? null,
    availableCapabilities: [...(input.availableCapabilities ?? [])].sort(),
    materialVersions: [...input.materialVersions],
    materialFragmentRefs: [...(input.materialFragmentRefs ?? [])],
    summaryId: input.summaryId ?? null,
    summaryVersion: input.summaryVersion ?? null,
    budgets,
    budgetUsage,
    truncationReasons,
    builderVersion: PLAINTEXT_CONTEXT_BUILDER_VERSION,
    systemPromptVersion: PLAINTEXT_SYSTEM_PROMPT_VERSION,
    toolSchemaVersion: PLAINTEXT_TOOL_SCHEMA_VERSION,
    modelId: input.modelId,
  }
  const businessSnapshot = input.businessSnapshot ?? null
  const reviewSnapshot = input.reviewSnapshot ?? null
  const availableCapabilities = [...(input.availableCapabilities ?? [])].sort()
  return {
    conversationVersion: input.conversationVersion,
    eventSequences: [...input.eventSequences],
    businessSnapshotVersion: input.businessSnapshotVersion,
    taskStatus: input.taskStatus,
    taskPhase: input.taskPhase,
    businessSnapshot,
    reviewSnapshot,
    availableCapabilities,
    summaryId: input.summaryId ?? null,
    summaryVersion: input.summaryVersion ?? null,
    materialFragmentRefs: [...(input.materialFragmentRefs ?? [])],
    budgets,
    budgetUsage,
    builderVersion: PLAINTEXT_CONTEXT_BUILDER_VERSION,
    systemPromptVersion: PLAINTEXT_SYSTEM_PROMPT_VERSION,
    toolSchemaVersion: PLAINTEXT_TOOL_SCHEMA_VERSION,
    modelId: input.modelId,
    inputHash: createHash('sha256').update(JSON.stringify(canonicalize(canonical))).digest('hex'),
    truncationReasons,
  }
}

export interface AuditablePlaintextContextInput
  extends Omit<PlaintextContextInput, 'eventSequences' | 'userText' | 'budgetUsage'> {
  originUserMessageSequence: number
  currentUserText: string
  events: readonly ConversationEventRecord[]
  summary?: {
    id: string
    version: number
    throughSequence: number
    text: string
  } | null
}

export function buildAuditablePlaintextContext(input: AuditablePlaintextContextInput) {
  const budgets = input.budgets ?? DEFAULT_PLAINTEXT_CONTEXT_BUDGETS
  const truncationReasons = [...(input.truncationReasons ?? [])]
  const summary = input.summary ?? null
  const materialShells = (input.materialContext ?? []).map((material) => ({
    ...material,
    excerpt: '',
  }))
  const authoritativeContextBase = {
    ...((input.authoritativeContext && typeof input.authoritativeContext === 'object'
      ? input.authoritativeContext
      : {}) as Record<string, unknown>),
    conversationEvents: [],
    materials: materialShells,
  }
  const authoritativeContextTokens = estimatePlaintextTokens(
    JSON.stringify(
      input.authoritativeContext ? authoritativeContextBase : {
        taskStatus: input.taskStatus,
        taskPhase: input.taskPhase,
        businessSnapshot: input.businessSnapshot ?? null,
        businessSnapshotVersion: input.businessSnapshotVersion,
        reviewSnapshot: input.reviewSnapshot ?? null,
        availableCapabilities: input.availableCapabilities ?? [],
        materialVersions: input.materialVersions,
      },
    ),
  )
  const requiredTokens =
    estimatePlaintextTokens(input.currentUserText) + authoritativeContextTokens + 64
  if (requiredTokens > budgets.totalTokens) {
    throw new RequiredContextBudgetExceededError(requiredTokens, budgets.totalTokens)
  }
  let remainingTotalTokens = Math.max(0, budgets.totalTokens - requiredTokens)

  const eligibleEvents = selectPlaintextContextEvents(
    input.events,
    input.conversationVersion,
    input.originUserMessageSequence,
  ).filter(
    (event) => event.sequence > (summary?.throughSequence ?? 0),
  )
  const currentEvent = eligibleEvents.find(
    (event) => event.sequence === input.originUserMessageSequence,
  )
  const priorEvents = eligibleEvents.filter(
    (event) => event.sequence !== input.originUserMessageSequence,
  )
  const projectedCurrent = currentEvent
    ? projectConversationEventsForAgent([currentEvent])
    : []
  const currentEventTokens = estimatePlaintextTokens(JSON.stringify(projectedCurrent)) - 2
  remainingTotalTokens -= Math.max(0, currentEventTokens)
  if (remainingTotalTokens < 0) {
    throw new RequiredContextBudgetExceededError(
      requiredTokens + currentEventTokens,
      budgets.totalTokens,
    )
  }
  const materialContentTokens = input.materialContentTokens ?? 0
  const independentlyAllowedMaterialTokens = Math.min(budgets.materialTokens, materialContentTokens)
  const materialTokens = Math.min(independentlyAllowedMaterialTokens, remainingTotalTokens)
  remainingTotalTokens -= materialTokens
  if (materialContentTokens > materialTokens) truncationReasons.push('material_token_budget')
  if (materialTokens < independentlyAllowedMaterialTokens) truncationReasons.push('total_token_budget')
  const selectedPriorReversed: ConversationEventRecord[] = []
  let tailContentTokens = 0
  const effectiveTailBudget = Math.min(budgets.recentTailTokens, remainingTotalTokens)
  const tailWasLimitedByTotal = effectiveTailBudget < budgets.recentTailTokens
  const tailEnvelopeTokens = estimatePlaintextTokens(
    '以下是本会话近期对话，请在此基础上继续，不要忽略已经说过的内容。\n\n\n\nUser: ',
  )
  const tailContentBudget = Math.max(0, effectiveTailBudget - tailEnvelopeTokens)
  for (const event of [...priorEvents].reverse()) {
    const role = event.kind === 'user_message' ? 'User: ' : 'Assistant: '
    const projectedEvent = projectConversationEventsForAgent([event])
    const tokens =
      estimatePlaintextTokens(`${role}${textFromPayload(event.payload) ?? ''}\n`) +
      Math.max(0, estimatePlaintextTokens(JSON.stringify(projectedEvent)) - 2)
    if (tailContentTokens + tokens > tailContentBudget) {
      if (tokens > 0) truncationReasons.push('recent_tail_token_budget')
      continue
    }
    selectedPriorReversed.push(event)
    tailContentTokens += tokens
  }
  const selectedEvents = [
    ...selectedPriorReversed.reverse(),
    ...(currentEvent ? [currentEvent] : []),
  ]
  if (selectedEvents.length < eligibleEvents.length) {
    truncationReasons.push('recent_tail_token_budget')
    if (tailWasLimitedByTotal) truncationReasons.push('total_token_budget')
  }
  const tailTokens = selectedPriorReversed.length > 0
    ? tailContentTokens + tailEnvelopeTokens
    : 0
  remainingTotalTokens -= tailTokens

  const effectiveSummaryBudget = Math.min(budgets.summaryTokens, remainingTotalTokens)
  const summaryEnvelope = '[交流背景摘要，不可作为候选证据]\n\n\n'
  const clippedSummary = clipToTokenBudget(
    summary?.text ?? '',
    Math.max(0, effectiveSummaryBudget - estimatePlaintextTokens(summaryEnvelope)),
  )
  if (clippedSummary.truncated) truncationReasons.push('summary_token_budget')
  if (clippedSummary.truncated && effectiveSummaryBudget < budgets.summaryTokens) {
    truncationReasons.push('total_token_budget')
  }

  const projected = projectConversationEventsForAgent(selectedEvents)
  const conversationText = composePlaintextUserText(input.currentUserText, projected)
  const userText = clippedSummary.text
    ? `[交流背景摘要，不可作为候选证据]\n${clippedSummary.text}\n\n${conversationText}`
    : conversationText
  const summaryTokens = clippedSummary.text
    ? estimatePlaintextTokens(clippedSummary.text) + estimatePlaintextTokens(summaryEnvelope)
    : 0
  const clippedMaterials = clipMaterialContext(input.materialContext ?? [], materialTokens)
  const finalAuthoritativeContext = input.authoritativeContext
    ? { ...authoritativeContextBase, conversationEvents: projected, materials: clippedMaterials }
    : null
  const totalTokens =
    estimatePlaintextTokens(JSON.stringify(finalAuthoritativeContext ?? input.authoritativeContext ?? {})) +
    estimatePlaintextTokens(userText)
  if (totalTokens > budgets.totalTokens) {
    throw new RequiredContextBudgetExceededError(totalTokens, budgets.totalTokens)
  }
  const uniqueReasons = [...new Set(truncationReasons)]
  const manifest = buildPlaintextContextManifest({
    ...input,
    authoritativeContext: finalAuthoritativeContext ?? input.authoritativeContext,
    eventSequences: selectedEvents.map((event) => event.sequence),
    userText,
    summaryId: summary?.id ?? null,
    summaryVersion: summary?.version ?? null,
    materialFragmentRefs: materialTokens > 0 ? input.materialFragmentRefs : [],
    budgets,
    budgetUsage: {
      summaryTokens,
      recentTailTokens: tailTokens,
      materialTokens,
      totalTokens,
      mediaItems: 0,
    },
    truncationReasons: uniqueReasons,
  })
  return { userText, selectedEvents, manifest }
}

function clipMaterialContext(
  materials: ReadonlyArray<Record<string, unknown>>,
  excerptTokens: number,
): Array<Record<string, unknown>> {
  let remaining = excerptTokens
  return materials.map((material) => {
    const excerpt = [...String(material.excerpt ?? '')]
    const take = Math.min(excerpt.length, remaining)
    remaining -= take
    return {
      ...material,
      excerpt: excerpt.slice(0, take).join(''),
      truncated: Boolean(material.truncated) || take < excerpt.length,
    }
  })
}

export function estimatePlaintextTokens(text: string): number {
  return [...text].length
}

export function hasGroundedCandidateEvidence(
  candidates: ReadonlyArray<{
    fieldKey?: string
    proposedValue?: unknown
    evidence: ReadonlyArray<
      | { kind: 'user_message'; excerpt: string; messageId?: string }
      | { kind: 'system_derivation'; rule: string }
      | { kind: 'material_region'; materialId: string; pageNumber: number; excerpt: string }
    >
  }>,
  sources: {
    userMessages: ReadonlyArray<{ id: string; text: string }>
    materials: ReadonlyArray<{
      materialId: string
      parseResultVersion: number
      pages: ReadonlyArray<{ pageNumber: number; text: string }>
    }>
    routeTemplates: ReadonlyArray<{ id: string; name: string }>
    materialReads: ReadonlySet<string>
    businessSnapshot: unknown
  },
): boolean {
  return candidates.every(
    (candidate) =>
      candidate.evidence.length > 0 &&
      candidate.evidence.every((evidence) => {
        if (evidence.kind === 'system_derivation') {
          const match = /^searchRouteTemplates:name_contains_token:(.+)$/.exec(evidence.rule.trim())
          if (match && typeof candidate.proposedValue === 'string') {
            const token = match[1].trim()
            return (
              token.length > 0 &&
              sources.routeTemplates.some(
                (template) => template.id === candidate.proposedValue && template.name.includes(token),
              )
            )
          }
          return verifiesBusinessSnapshotDerivation(
            evidence.rule.trim(),
            candidate.fieldKey,
            candidate.proposedValue,
            sources.businessSnapshot,
          )
        }
        if (evidence.kind === 'material_region') {
          const excerpt = evidence.excerpt.trim()
          return (
            excerpt.length > 0 &&
            sources.materials.some(
              (material) =>
                material.materialId === evidence.materialId &&
                sources.materialReads.has(
                  `${material.materialId}:${material.parseResultVersion}:${evidence.pageNumber}`,
                ) &&
                material.pages.some(
                  (page) =>
                    page.pageNumber === evidence.pageNumber && page.text.includes(excerpt),
                ),
            )
          )
        }
        const excerpt = evidence.excerpt.trim()
        return (
          excerpt.length > 0 &&
          sources.userMessages.some(
            (message) =>
              (!evidence.messageId || message.id === evidence.messageId) &&
              message.text.includes(excerpt),
          )
        )
      }),
  )
}

function verifiesBusinessSnapshotDerivation(
  rule: string,
  fieldKey: string | undefined,
  proposedValue: unknown,
  snapshot: unknown,
): boolean {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return false
  const business = snapshot as Record<string, unknown>
  const direct = /^businessSnapshot:([A-Za-z][A-Za-z0-9_]*)$/.exec(rule)
  if (direct) return fieldKey === direct[1] && business[direct[1]] === proposedValue

  const dateOffset = /^startDate plus (\d{1,3}) days$/.exec(rule)
  if (!dateOffset || fieldKey !== 'endDate' || typeof proposedValue !== 'string') return false
  const startDate = business.startDate
  if (typeof startDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return false
  const date = new Date(`${startDate}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime())) return false
  date.setUTCDate(date.getUTCDate() + Number(dateOffset[1]))
  return date.toISOString().slice(0, 10) === proposedValue
}

function clipToTokenBudget(text: string, maxTokens: number) {
  const characters = [...text.trim()]
  if (characters.length <= maxTokens) {
    return { text: characters.join(''), truncated: false }
  }
  return { text: characters.slice(0, Math.max(0, maxTokens)).join(''), truncated: true }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    )
  }
  return value
}

export function parseEventSequences(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.filter((item): item is number => Number.isInteger(item) && item > 0)
}

export function parseManifestMaterialVersions(
  value: unknown,
): Array<{ materialId: string; parseResultVersion: number }> {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return []
    const record = item as Record<string, unknown>
    return typeof record.materialId === 'string' &&
      Number.isInteger(record.parseResultVersion) &&
      Number(record.parseResultVersion) > 0
      ? [{ materialId: record.materialId, parseResultVersion: Number(record.parseResultVersion) }]
      : []
  })
}

const PLAINTEXT_CONTEXT_TAIL_KINDS = new Set(['user_message', 'agent_message'])
const PLAINTEXT_CONTEXT_TAIL_LIMIT = 40

export function selectPlaintextContextEvents(
  events: readonly ConversationEventRecord[],
  conversationVersion: number,
  originUserMessageSequence?: number,
): ConversationEventRecord[] {
  return events
    .filter((event) => {
      if (event.sequence > conversationVersion || !PLAINTEXT_CONTEXT_TAIL_KINDS.has(event.kind)) {
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
    .slice(-PLAINTEXT_CONTEXT_TAIL_LIMIT)
}

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
