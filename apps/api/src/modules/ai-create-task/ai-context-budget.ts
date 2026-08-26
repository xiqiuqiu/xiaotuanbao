import { createHash } from 'node:crypto'
import {
  AI_CREATE_SYSTEM_INSTRUCTIONS,
  PINNED_PARSE_CONTEXT_PREFACE,
  TOKEN_ESTIMATOR_VERSION,
  TOKEN_LIMITER_PROCESSOR_VERSION,
  TOKEN_LIMITER_TRIM_MODE,
  OUTPUT_RESERVE_VERSION,
  PROVIDER_FRAMING_VERSION,
  aiCreateModelContractForTools,
  contextCapacityProfileFor,
  tokenLimiterLimitTokens,
  type ConversationEventForAgent,
  type MaterialParseIndexItem,
} from '@xiaotuanbao/ai-contracts'
import {
  PLAINTEXT_SYSTEM_PROMPT_VERSION,
  PLAINTEXT_TOOL_SCHEMA_VERSION,
} from './ai-conversation.constants'

export const CONTEXT_CAPACITY_EXCEEDED = 'CONTEXT_CAPACITY_EXCEEDED'
export { CONTEXT_PROFILE_MISSING } from '@xiaotuanbao/ai-contracts'

export interface BudgetProjection {
  conversationBackground: { summary: string | null; summaryVersion: number | null }
  recentTail: ConversationEventForAgent[]
  pinnedMaterials: MaterialParseIndexItem[]
  truncationReasons: string[]
}

export interface ContextSectionUsage {
  key:
    | 'system_constraints'
    | 'tool_schemas'
    | 'business_facts'
    | 'unresolved_state'
    | 'conversation_summary'
    | 'recent_tail'
    | 'sources'
    | 'current_input'
    | 'assembled_user_message'
  version: string | null
  estimatedTokens: number
  sha256: string
}

export interface ContextBudgetRecord {
  profileVersion: string
  estimatorVersion: string
  providerFramingVersion: string
  outputReserveVersion: string
  tokenLimiterProcessorVersion: string
  tokenLimiterTrimMode: 'contiguous'
  contextWindowTokens: number
  softInputLimitTokens: number
  outputReserveTokens: number
  providerFramingTokens: number
  safetyMarginTokens: number
  tokenLimiterLimitTokens: number
  staticInputTokens: number
  dynamicBudgetTokens: number
  estimatedInputTokens: number
  overSoftLimit: boolean
}

export interface BudgetedContext {
  userText: string
  userTextSha256: string
  inputHash: string
  sections: ContextSectionUsage[]
  budget: ContextBudgetRecord
  projection: BudgetProjection
  truncationReasons: string[]
}

export function buildBudgetedContext(input: {
  modelId: string
  toolNames: readonly string[]
  currentUserText: string
  businessFacts: unknown
  unresolvedState: unknown
  projection: BudgetProjection
  systemInstructions?: string
  systemPromptVersion?: string
  toolSchemaVersion?: string
}): BudgetedContext {
  const profile = contextCapacityProfileFor(input.modelId)
  const limiterLimit = tokenLimiterLimitTokens(profile)
  const modelContract = aiCreateModelContractForTools(input.toolNames)
  const businessFactsText = stableJson(input.businessFacts)
  const unresolvedStateText = stableJson(input.unresolvedState)
  const systemInstructions = input.systemInstructions ?? AI_CREATE_SYSTEM_INSTRUCTIONS
  const systemPromptVersion = input.systemPromptVersion ?? PLAINTEXT_SYSTEM_PROMPT_VERSION
  const toolSchemaVersion = input.toolSchemaVersion ?? PLAINTEXT_TOOL_SCHEMA_VERSION
  const { staticInputTokens, dynamicBudgetTokens } = measureStaticContextBudget({
    modelId: input.modelId,
    toolNames: input.toolNames,
    systemInstructions,
    systemPromptVersion,
    toolSchemaVersion,
  })
  const systemSection = section(
    'system_constraints',
    systemInstructions,
    systemPromptVersion,
  )
  const toolSchemaSection = section(
    'tool_schemas',
    modelContract.toolSchemaText,
    toolSchemaVersion,
  )
  const projection: BudgetProjection = {
    conversationBackground: { ...input.projection.conversationBackground },
    recentTail: input.projection.recentTail.map((event) => ({ ...event })),
    pinnedMaterials: input.projection.pinnedMaterials.map((material) => ({ ...material })),
    truncationReasons: [...input.projection.truncationReasons],
  }
  const reasons = new Set(projection.truncationReasons)
  let userText = renderUserText({
    businessFactsText,
    unresolvedStateText,
    currentUserText: input.currentUserText,
    projection,
  })

  for (let index = projection.pinnedMaterials.length - 1; index >= 0; index -= 1) {
    if (estimateTokens(userText) <= dynamicBudgetTokens) {
      break
    }
    const material = projection.pinnedMaterials[index]
    if (material?.excerpt) {
      material.excerpt = ''
      material.truncated = true
      reasons.add('sources_budget')
      userText = renderUserText({
        businessFactsText,
        unresolvedStateText,
        currentUserText: input.currentUserText,
        projection,
      })
    }
  }

  if (
    estimateTokens(userText) > dynamicBudgetTokens &&
    projection.conversationBackground.summary != null
  ) {
    projection.conversationBackground.summary = null
    reasons.add('conversation_summary_budget')
    userText = renderUserText({
      businessFactsText,
      unresolvedStateText,
      currentUserText: input.currentUserText,
      projection,
    })
  }

  while (estimateTokens(userText) > dynamicBudgetTokens && projection.recentTail.length > 0) {
    const oldestAgentIndex = projection.recentTail.findIndex(
      (event) => event.kind === 'agent_message',
    )
    projection.recentTail.splice(oldestAgentIndex >= 0 ? oldestAgentIndex : 0, 1)
    reasons.add('recent_tail_budget')
    userText = renderUserText({
      businessFactsText,
      unresolvedStateText,
      currentUserText: input.currentUserText,
      projection,
    })
  }

  if (estimateTokens(userText) > dynamicBudgetTokens) {
    throw new Error(CONTEXT_CAPACITY_EXCEEDED)
  }

  projection.truncationReasons = [...reasons].sort()
  const summaryText = projection.conversationBackground.summary ?? '本阶段无滚动摘要。'
  const recentTailText = formatTail(projection.recentTail)
  const sourcesText = formatMaterials(projection.pinnedMaterials)

  const sections: ContextSectionUsage[] = [
    systemSection,
    toolSchemaSection,
    section('business_facts', businessFactsText),
    section('unresolved_state', unresolvedStateText),
    section(
      'conversation_summary',
      summaryText,
      input.projection.conversationBackground.summaryVersion?.toString() ?? null,
    ),
    section('recent_tail', recentTailText),
    section('sources', sourcesText),
    section('current_input', input.currentUserText),
    section('assembled_user_message', userText),
  ]
  const estimatedInputTokens = staticInputTokens + estimateTokens(userText)

  return {
    userText,
    userTextSha256: sha256(userText),
    inputHash: sha256(
      stableJson({
        modelId: input.modelId,
        systemPrompt: sections[0].sha256,
        toolSchemas: sections[1].sha256,
        userMessage: sections.at(-1)?.sha256,
      }),
    ),
    sections,
    budget: {
      profileVersion: profile.profileVersion,
      estimatorVersion: TOKEN_ESTIMATOR_VERSION,
      providerFramingVersion: PROVIDER_FRAMING_VERSION,
      outputReserveVersion: OUTPUT_RESERVE_VERSION,
      tokenLimiterProcessorVersion: TOKEN_LIMITER_PROCESSOR_VERSION,
      tokenLimiterTrimMode: TOKEN_LIMITER_TRIM_MODE,
      contextWindowTokens: profile.contextWindowTokens,
      softInputLimitTokens: profile.softInputLimitTokens,
      outputReserveTokens: profile.outputReserveTokens,
      providerFramingTokens: profile.providerFramingTokens,
      safetyMarginTokens: profile.safetyMarginTokens,
      tokenLimiterLimitTokens: limiterLimit,
      staticInputTokens,
      dynamicBudgetTokens,
      estimatedInputTokens,
      overSoftLimit: estimatedInputTokens > profile.softInputLimitTokens,
    },
    projection,
    truncationReasons: projection.truncationReasons,
  }
}

function renderUserText(input: {
  businessFactsText: string
  unresolvedStateText: string
  currentUserText: string
  projection: BudgetProjection
}): string {
  return [
    '【当前业务事实】',
    input.businessFactsText,
    '',
    '【未决交互】',
    input.unresolvedStateText,
    '',
    '【交流背景】',
    input.projection.conversationBackground.summary ?? '本阶段无滚动摘要。',
    '',
    '【近期对话】',
    formatTail(input.projection.recentTail),
    '',
    '【本批资料】',
    formatMaterials(input.projection.pinnedMaterials),
    '',
    '【本轮指令】',
    input.currentUserText,
  ].join('\n')
}

function section(
  key: ContextSectionUsage['key'],
  content: string,
  version: string | null = null,
): ContextSectionUsage {
  return {
    key,
    version,
    estimatedTokens: estimateTokens(content),
    sha256: sha256(content),
  }
}

function estimateTokens(text: string): number {
  return estimateContextTokens(text)
}

export function estimateContextTokens(text: string): number {
  return Math.ceil(Buffer.byteLength(text, 'utf8') / 3)
}

export function measureStaticContextBudget(input: {
  modelId: string
  toolNames: readonly string[]
  systemInstructions?: string
  systemPromptVersion?: string
  toolSchemaVersion?: string
}): { staticInputTokens: number; dynamicBudgetTokens: number } {
  const profile = contextCapacityProfileFor(input.modelId)
  const modelContract = aiCreateModelContractForTools(input.toolNames)
  const systemInstructions = input.systemInstructions ?? AI_CREATE_SYSTEM_INSTRUCTIONS
  const systemPromptVersion = input.systemPromptVersion ?? PLAINTEXT_SYSTEM_PROMPT_VERSION
  const toolSchemaVersion = input.toolSchemaVersion ?? PLAINTEXT_TOOL_SCHEMA_VERSION
  const staticInputTokens =
    section('system_constraints', systemInstructions, systemPromptVersion).estimatedTokens +
    section('tool_schemas', modelContract.toolSchemaText, toolSchemaVersion).estimatedTokens
  const dynamicBudgetTokens = Math.min(
    profile.softInputLimitTokens - staticInputTokens,
    profile.contextWindowTokens -
      profile.outputReserveTokens -
      profile.providerFramingTokens -
      profile.safetyMarginTokens -
      staticInputTokens,
  )
  return { staticInputTokens, dynamicBudgetTokens }
}

function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex')
}

function stableJson(value: unknown): string {
  return JSON.stringify(canonicalize(value))
}

function canonicalize(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString()
  }
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

function formatTail(events: ConversationEventForAgent[]): string {
  const lines = events.flatMap((event) => {
    if (!event.text) {
      return []
    }
    return [`${event.kind === 'user_message' ? 'User' : 'Assistant'}: ${event.text}`]
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
