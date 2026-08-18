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

export type ExistingContextManifestIdentity = {
  id: string
  manifestVersion: number
  inputHash: string
}

export type ResolvedContextManifestIdentity =
  | { action: 'reuse'; id: string; manifestVersion: number }
  | { action: 'create'; manifestVersion: number }

export function resolveContextManifestIdentity(
  existing: readonly ExistingContextManifestIdentity[],
  inputHash: string,
): ResolvedContextManifestIdentity {
  const reused = existing
    .filter((item) => item.inputHash === inputHash)
    .slice()
    .sort((left, right) =>
      left.manifestVersion === right.manifestVersion
        ? left.id.localeCompare(right.id)
        : left.manifestVersion - right.manifestVersion,
    )[0]
  if (reused) {
    return {
      action: 'reuse',
      id: reused.id,
      manifestVersion: reused.manifestVersion,
    }
  }
  return {
    action: 'create',
    manifestVersion: existing.reduce((max, item) => Math.max(max, item.manifestVersion), 0) + 1,
  }
}

export class UngroundedCandidateEvidenceError extends Error {
  constructor() {
    super('UNGROUNDED_CANDIDATE_EVIDENCE')
    this.name = 'UngroundedCandidateEvidenceError'
  }
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
  const startDates = [...snapshotStartDates(sources.businessSnapshot)]
  const offsetCandidates: Array<(typeof candidates)[number]> = []
  for (const candidate of candidates) {
    if (usesStartDateOffset(candidate)) {
      offsetCandidates.push(candidate)
      continue
    }
    if (!verifiesCandidateEvidence(candidate, sources, startDates)) return false
    collectVerifiedStartDate(candidate, startDates)
  }
  return offsetCandidates.every((candidate) =>
    verifiesCandidateEvidence(candidate, sources, startDates),
  )
}

type GroundingCandidate = Parameters<typeof hasGroundedCandidateEvidence>[0][number]
type GroundingSources = Parameters<typeof hasGroundedCandidateEvidence>[1]

const START_DATE_OFFSET_RULE = /^startDate plus (\d{1,3}) days$/

function usesStartDateOffset(candidate: GroundingCandidate): boolean {
  return candidate.evidence.some(
    (evidence) =>
      evidence.kind === 'system_derivation' && START_DATE_OFFSET_RULE.test(evidence.rule.trim()),
  )
}

function collectVerifiedStartDate(candidate: GroundingCandidate, startDates: string[]) {
  if (candidate.fieldKey !== 'startDate' || typeof candidate.proposedValue !== 'string') return
  if (normalizeIsoDate(candidate.proposedValue)) startDates.push(candidate.proposedValue)
}

function verifiesCandidateEvidence(
  candidate: GroundingCandidate,
  sources: GroundingSources,
  startDates: readonly string[],
): boolean {
  return (
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
          startDates,
          sources.userMessages,
        )
      }
      if (evidence.kind === 'material_region') {
        const excerpt = evidence.excerpt.trim()
        if (!excerpt) return false
        return sources.materials.some(
          (material) =>
            material.materialId === evidence.materialId &&
            sources.materialReads.has(
              `${material.materialId}:${material.parseResultVersion}:${evidence.pageNumber}`,
            ) &&
            material.pages.some((page) => {
              if (page.pageNumber !== evidence.pageNumber || !page.text.includes(excerpt)) {
                return false
              }
              if (isDateField(candidate.fieldKey)) {
                return verifiesCalendarDateInSource(excerpt, candidate.proposedValue, page.text)
              }
              return proposedValueAppearsInSource(candidate.proposedValue, page.text)
            }),
        )
      }
      return verifiesUserMessageEvidence(
        evidence,
        candidate.fieldKey,
        candidate.proposedValue,
        sources.userMessages,
      )
    })
  )
}

function isDateField(fieldKey: string | undefined): boolean {
  return fieldKey === 'startDate' || fieldKey === 'endDate'
}

function verifiesUserMessageEvidence(
  evidence: { excerpt: string },
  fieldKey: string | undefined,
  proposedValue: unknown,
  messages: ReadonlyArray<{ text: string }>,
): boolean {
  const excerpt = evidence.excerpt.trim()
  if (!excerpt) return false
  return messages.some((message) => {
    if (isDateField(fieldKey)) {
      return verifiesCalendarDateInSource(excerpt, proposedValue, message.text)
    }
    return (
      message.text.includes(excerpt) && proposedValueAppearsInSource(proposedValue, message.text)
    )
  })
}

function verifiesCalendarDateInSource(
  excerpt: string,
  proposedValue: unknown,
  sourceText: string,
): boolean {
  if (typeof proposedValue !== 'string') return false
  if (!extractCompleteCalendarDates(sourceText).includes(proposedValue)) return false
  const excerptDates = extractCompleteCalendarDates(excerpt)
  if (excerptDates.length > 0) return excerptDates.includes(proposedValue)
  return sourceText.includes(excerpt)
}

function proposedValueAppearsInSource(proposedValue: unknown, sourceText: string): boolean {
  if (proposedValue == null) return true
  if (typeof proposedValue === 'number') return sourceText.includes(String(proposedValue))
  if (typeof proposedValue === 'string' && proposedValue.length > 0) {
    return sourceText.includes(proposedValue)
  }
  return true
}

function verifiesBusinessSnapshotDerivation(
  rule: string,
  fieldKey: string | undefined,
  proposedValue: unknown,
  snapshot: unknown,
  startDates: readonly string[],
  userMessages: ReadonlyArray<{ text: string }>,
): boolean {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    return verifiesDateOffset(rule, fieldKey, proposedValue, startDates, userMessages)
  }
  const business = snapshot as Record<string, unknown>
  const direct = /^businessSnapshot:([A-Za-z][A-Za-z0-9_]*)$/.exec(rule)
  if (direct) return fieldKey === direct[1] && business[direct[1]] === proposedValue
  return verifiesDateOffset(rule, fieldKey, proposedValue, startDates, userMessages)
}

function verifiesDateOffset(
  rule: string,
  fieldKey: string | undefined,
  proposedValue: unknown,
  startDates: readonly string[],
  userMessages: ReadonlyArray<{ text: string }>,
): boolean {
  const dateOffset = START_DATE_OFFSET_RULE.exec(rule)
  if (!dateOffset || fieldKey !== 'endDate' || typeof proposedValue !== 'string') return false
  const days = Number(dateOffset[1])
  if (!startDates.some((startDate) => addUtcDays(startDate, days) === proposedValue)) return false
  const durations = extractSpokenDurations(userMessages)
  if (durations.length === 0) return true
  return durations.some((daysInclusive) => days === daysInclusive - 1)
}

function extractSpokenDurations(messages: ReadonlyArray<{ text: string }>): number[] {
  const found = new Set<number>()
  const patterns = [/(\d{1,3})\s*天/g, /(\d{1,3})日游/g]
  for (const message of messages) {
    for (const pattern of patterns) {
      for (const match of message.text.matchAll(pattern)) {
        const daysInclusive = Number(match[1])
        if (daysInclusive > 0) found.add(daysInclusive)
      }
    }
  }
  return [...found]
}

function snapshotStartDates(snapshot: unknown): string[] {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return []
  const startDate = (snapshot as Record<string, unknown>).startDate
  return typeof startDate === 'string' && normalizeIsoDate(startDate) ? [startDate] : []
}

function extractCompleteCalendarDates(text: string): string[] {
  const dates = new Set<string>()
  const patterns = [
    /(\d{4})年的?(\d{1,2})月(\d{1,2})[日号]/g,
    /(\d{4})-(\d{1,2})-(\d{1,2})/g,
    /(\d{4})\/(\d{1,2})\/(\d{1,2})/g,
  ]
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const iso = toIsoDate(Number(match[1]), Number(match[2]), Number(match[3]))
      if (iso) dates.add(iso)
    }
  }
  return [...dates]
}

function toIsoDate(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function normalizeIsoDate(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  return toIsoDate(Number(value.slice(0, 4)), Number(value.slice(5, 7)), Number(value.slice(8, 10)))
}

function addUtcDays(startDate: string, days: number): string | null {
  const iso = normalizeIsoDate(startDate)
  if (!iso) return null
  const date = new Date(`${iso}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
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
