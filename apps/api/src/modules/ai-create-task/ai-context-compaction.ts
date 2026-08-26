import {
  CONTEXT_COMPACTION_ACTIVATE_RATIO,
  CONTEXT_COMPACTION_BUFFER_RATIO,
  compactConversationEvents,
  selectCompactableEvents,
  type CompactionInputEvent,
  type ContextCompactionVersionRecord,
} from '@xiaotuanbao/ai-contracts'
import type { Prisma } from '@prisma/client'
import {
  CONTEXT_CAPACITY_EXCEEDED,
  buildBudgetedContext,
  estimateContextTokens,
  measureStaticContextBudget,
  type BudgetedContext,
} from './ai-context-budget'
import {
  buildFrozenProjection,
  conversationEventText,
  type ConversationEventRecord,
  type FrozenContextProjection,
} from './ai-context-manifest'

export const CONTEXT_PREPARE_FAILED = 'CONTEXT_PREPARE_FAILED'

export type CompactionPlan = {
  originProjection: FrozenContextProjection
  originalFits: boolean
  record: ContextCompactionVersionRecord | null
  useSummary: boolean
  persist: boolean
}

export function planContextCompaction(input: {
  conversationId: string
  conversationVersion: number
  currentUserMessageSequence?: number
  originUserMessageSequence?: number
  events: ConversationEventRecord[]
  materials: FrozenContextProjection['pinnedMaterials']
  materialTruncationReasons?: string[]
  currentUserText: string
  businessFacts: unknown
  unresolvedState: unknown
  modelId: string
  toolNames: readonly string[]
  systemInstructions?: string
  systemPromptVersion?: string
  toolSchemaVersion?: string
  existingCompleted?: { version: number; inputDigest: string; policyVersion: string } | null
}): CompactionPlan {
  const originProjection = buildFrozenProjection({
    events: input.events,
    conversationVersion: input.conversationVersion,
    originUserMessageSequence: input.originUserMessageSequence,
    currentUserMessageSequence: input.currentUserMessageSequence,
    materials: input.materials,
    materialTruncationReasons: input.materialTruncationReasons,
  })
  const originalFits = contextFits({
    ...budgetInput(input),
    projection: originProjection,
  })
  const compactable = selectCompactableEvents(
    eventsAsCompactionInput(input.events),
    input.conversationVersion,
    input.currentUserMessageSequence,
  )
  const record = compactConversationEvents({
    conversationId: input.conversationId,
    conversationVersion: input.conversationVersion,
    currentUserMessageSequence: input.currentUserMessageSequence,
    events: compactable,
  })
  if (!record) {
    if (!originalFits) {
      throw new Error(CONTEXT_CAPACITY_EXCEEDED)
    }
    return {
      originProjection,
      originalFits,
      record: null,
      useSummary: false,
      persist: false,
    }
  }

  const { dynamicBudgetTokens } = measureStaticContextBudget({
    modelId: input.modelId,
    toolNames: input.toolNames,
    systemInstructions: input.systemInstructions,
    systemPromptVersion: input.systemPromptVersion,
    toolSchemaVersion: input.toolSchemaVersion,
  })
  const historyTokens = historyTokensFrom(compactable)
  const alreadyStored =
    input.existingCompleted?.inputDigest === record.inputDigest &&
    input.existingCompleted.policyVersion === record.policyVersion
  const overActivate = historyTokens >= dynamicBudgetTokens * CONTEXT_COMPACTION_ACTIVATE_RATIO
  const overBuffer = historyTokens >= dynamicBudgetTokens * CONTEXT_COMPACTION_BUFFER_RATIO

  if (!originalFits) {
    const compactedFits = contextFits({
      ...budgetInput(input),
      projection: buildFrozenProjection({
        events: input.events,
        conversationVersion: input.conversationVersion,
        originUserMessageSequence: input.originUserMessageSequence,
        currentUserMessageSequence: input.currentUserMessageSequence,
        materials: input.materials,
        materialTruncationReasons: input.materialTruncationReasons,
        compaction: {
          summary: record.summary,
          summaryVersion: input.existingCompleted?.version ?? 1,
          coveredEventSequences: record.coveredEventSequences,
        },
      }),
    })
    if (!compactedFits) {
      throw new Error(CONTEXT_CAPACITY_EXCEEDED)
    }
    return {
      originProjection,
      originalFits,
      record,
      useSummary: true,
      persist: !alreadyStored,
    }
  }

  if (overActivate) {
    return {
      originProjection,
      originalFits,
      record,
      useSummary: true,
      persist: !alreadyStored,
    }
  }
  if (overBuffer) {
    return {
      originProjection,
      originalFits,
      record,
      useSummary: false,
      persist: !alreadyStored,
    }
  }
  return {
    originProjection,
    originalFits,
    record,
    useSummary: false,
    persist: false,
  }
}

export async function resolvePreparedProjection(
  prisma: {
    aiContextCompactionVersion: Prisma.TransactionClient['aiContextCompactionVersion']
  },
  input: Parameters<typeof planContextCompaction>[0] & { organizationId: string },
): Promise<{
  projection: FrozenContextProjection
  summaryVersion: number | null
  plan: CompactionPlan
}> {
  const preview = compactConversationEvents({
    conversationId: input.conversationId,
    conversationVersion: input.conversationVersion,
    currentUserMessageSequence: input.currentUserMessageSequence,
    events: eventsAsCompactionInput(input.events),
  })
  const stored = preview
    ? await prisma.aiContextCompactionVersion.findFirst({
        where: {
          conversationId: input.conversationId,
          inputDigest: preview.inputDigest,
          policyVersion: preview.policyVersion,
        },
        select: { version: true, inputDigest: true, policyVersion: true, status: true },
      })
    : null
  const existingCompleted =
    stored?.status === 'completed'
      ? {
          version: stored.version,
          inputDigest: stored.inputDigest,
          policyVersion: stored.policyVersion,
        }
      : null
  const plan = planContextCompaction({
    ...input,
    existingCompleted,
  })
  let summaryVersion = existingCompleted?.version ?? null
  if (plan.persist && plan.record) {
    try {
      const persisted = await persistCompletedCompactionVersion(prisma as Prisma.TransactionClient, {
        organizationId: input.organizationId,
        conversationId: input.conversationId,
        record: plan.record,
      })
      summaryVersion = persisted.version
    } catch {
      if (!plan.originalFits) {
        throw new Error(CONTEXT_PREPARE_FAILED)
      }
      return {
        projection: plan.originProjection,
        summaryVersion: null,
        plan: { ...plan, useSummary: false, persist: false },
      }
    }
  }
  return {
    projection: applyCompactionPlan(plan, input.events, input.conversationVersion, input.materials, {
      originUserMessageSequence: input.originUserMessageSequence,
      currentUserMessageSequence: input.currentUserMessageSequence,
      materialTruncationReasons: input.materialTruncationReasons,
      summaryVersion,
    }),
    summaryVersion: plan.useSummary ? summaryVersion : null,
    plan,
  }
}

export function applyCompactionPlan(
  plan: CompactionPlan,
  events: ConversationEventRecord[],
  conversationVersion: number,
  materials: FrozenContextProjection['pinnedMaterials'],
  options: {
    originUserMessageSequence?: number
    currentUserMessageSequence?: number
    materialTruncationReasons?: string[]
    summaryVersion: number | null
  },
): FrozenContextProjection {
  if (!plan.useSummary || !plan.record || options.summaryVersion == null) {
    return plan.originProjection
  }
  return buildFrozenProjection({
    events,
    conversationVersion,
    originUserMessageSequence: options.originUserMessageSequence,
    currentUserMessageSequence: options.currentUserMessageSequence,
    materials,
    materialTruncationReasons: options.materialTruncationReasons,
    compaction: {
      summary: plan.record.summary,
      summaryVersion: options.summaryVersion,
      coveredEventSequences: plan.record.coveredEventSequences,
    },
  })
}

export async function persistCompletedCompactionVersion(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string
    conversationId: string
    record: ContextCompactionVersionRecord
  },
): Promise<{ version: number }> {
  const existing = await tx.aiContextCompactionVersion.findFirst({
    where: {
      conversationId: input.conversationId,
      inputDigest: input.record.inputDigest,
      policyVersion: input.record.policyVersion,
    },
    select: { id: true, version: true, status: true },
  })
  if (existing?.status === 'completed') {
    return { version: existing.version }
  }
  const version =
    existing?.version ??
    ((
      await tx.aiContextCompactionVersion.aggregate({
        where: { conversationId: input.conversationId },
        _max: { version: true },
      })
    )._max.version ?? 0) + 1
  const data = {
    organizationId: input.organizationId,
    conversationId: input.conversationId,
    version,
    status: 'completed' as const,
    conversationVersionCeiling: input.record.conversationVersionCeiling,
    coveredSequenceStart: input.record.coveredSequenceStart,
    coveredSequenceEnd: input.record.coveredSequenceEnd,
    coveredEventSequences: input.record.coveredEventSequences,
    policyVersion: input.record.policyVersion,
    configVersion: input.record.configVersion,
    modelId: input.record.modelId,
    summary: input.record.summary,
    digest: input.record.digest,
    inputDigest: input.record.inputDigest,
    locators: JSON.parse(JSON.stringify(input.record.locators)) as Prisma.InputJsonValue,
  }
  if (existing) {
    await tx.aiContextCompactionVersion.update({
      where: { id: existing.id },
      data,
    })
    return { version }
  }
  try {
    await tx.aiContextCompactionVersion.create({ data })
    return { version }
  } catch (error) {
    const raced = await tx.aiContextCompactionVersion.findFirst({
      where: {
        conversationId: input.conversationId,
        inputDigest: input.record.inputDigest,
        policyVersion: input.record.policyVersion,
      },
      select: { version: true, status: true },
    })
    if (raced?.status === 'completed') {
      return { version: raced.version }
    }
    throw error
  }
}

function eventsAsCompactionInput(events: ConversationEventRecord[]): CompactionInputEvent[] {
  return events.map((event) => ({
    sequence: event.sequence,
    kind: event.kind,
    text: conversationEventText(event.payload),
  }))
}

function historyTokensFrom(events: CompactionInputEvent[]): number {
  const lines = events.flatMap((event) => {
    if (!event.text.trim()) {
      return []
    }
    return [`${event.kind === 'user_message' ? 'User' : 'Assistant'}: ${event.text}`]
  })
  return estimateContextTokens(lines.length > 0 ? lines.join('\n') : '（无）')
}

function budgetInput(input: {
  currentUserText: string
  businessFacts: unknown
  unresolvedState: unknown
  modelId: string
  toolNames: readonly string[]
  systemInstructions?: string
  systemPromptVersion?: string
  toolSchemaVersion?: string
}) {
  return {
    modelId: input.modelId,
    toolNames: input.toolNames,
    currentUserText: input.currentUserText,
    businessFacts: input.businessFacts,
    unresolvedState: input.unresolvedState,
    systemInstructions: input.systemInstructions,
    systemPromptVersion: input.systemPromptVersion,
    toolSchemaVersion: input.toolSchemaVersion,
  }
}

function contextFits(
  input: Parameters<typeof buildBudgetedContext>[0],
): boolean {
  try {
    buildBudgetedContext(input)
    return true
  } catch (error) {
    if (error instanceof Error && error.message === CONTEXT_CAPACITY_EXCEEDED) {
      return false
    }
    throw error
  }
}

export function budgetedContextForPlan(
  input: Parameters<typeof buildBudgetedContext>[0],
): BudgetedContext {
  return buildBudgetedContext(input)
}
