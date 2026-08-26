import {
  CONTEXT_COMPACTION_ACTIVATE_RATIO,
  CONTEXT_COMPACTION_BUFFER_RATIO,
  CONTEXT_COMPACTION_DISCLAIMER,
  CONTEXT_COMPACTION_KEEP_TAIL,
  compactConversationEvents,
} from '@xiaotuanbao/ai-contracts'
import {
  buildBudgetedContext,
  CONTEXT_CAPACITY_EXCEEDED,
  estimateContextTokens,
  measureStaticContextBudget,
} from './ai-context-budget'
import {
  applyCompactionPlan,
  CONTEXT_PREPARE_FAILED,
  persistCompletedCompactionVersion,
  planContextCompaction,
  resolvePreparedProjection,
} from './ai-context-compaction'
import {
  buildContextManifest,
  buildFrozenProjection,
  eventSequencesForModelInput,
} from './ai-context-manifest'
import { PLAINTEXT_TOOL_SCHEMA_VERSION } from './ai-conversation.constants'

function bulkyEvents(count: number, chars: number, currentSequence = count) {
  return Array.from({ length: count }, (_, index) => ({
    sequence: index + 1,
    kind: index % 2 === 0 ? 'user_message' : 'agent_message',
    payload: { text: `历史-${index + 1}-${'甲'.repeat(chars)}` },
  })).filter((event) => event.sequence !== currentSequence)
}

function historyTokensOf(events: Array<{ kind: string; payload: { text: string } }>): number {
  const lines = events.flatMap((event) => {
    if (!event.payload.text.trim()) {
      return []
    }
    return [`${event.kind === 'user_message' ? 'User' : 'Assistant'}: ${event.payload.text}`]
  })
  return estimateContextTokens(lines.length > 0 ? lines.join('\n') : '（无）')
}

function bulkyEventsForHistoryRatio(ratio: number, count = 20) {
  const { dynamicBudgetTokens } = measureStaticContextBudget({
    modelId: plannerBase.modelId,
    toolNames: plannerBase.toolNames,
  })
  const target = Math.floor(dynamicBudgetTokens * ratio)
  const compactableCount = count - 1
  let low = 8
  let high = Math.max(80, Math.ceil(target / compactableCount) * 4)
  let best = bulkyEvents(count, low, count)
  for (let step = 0; step < 24; step += 1) {
    const mid = Math.floor((low + high) / 2)
    const events = bulkyEvents(count, mid, count)
    const tokens = historyTokensOf(events)
    best = events
    if (tokens < target) {
      low = mid + 1
    } else {
      high = mid - 1
    }
  }
  return best
}

function compactionTx(options?: {
  existing?: { version: number; inputDigest: string; policyVersion: string; status: string }
  failWrite?: boolean
}) {
  const created: Array<{ inputDigest: string; version: number }> = []
  return {
    created,
    prisma: {
      aiContextCompactionVersion: {
        findFirst: async () => options?.existing ?? null,
        aggregate: async () => ({ _max: { version: options?.existing?.version ?? 0 } }),
        create: async ({ data }: { data: { inputDigest: string; version: number } }) => {
          if (options?.failWrite) {
            throw new Error('compaction store unavailable')
          }
          created.push({ inputDigest: data.inputDigest, version: data.version })
          return data
        },
        update: async () => {
          if (options?.failWrite) {
            throw new Error('compaction store unavailable')
          }
          return {}
        },
      },
    },
  }
}

const plannerBase = {
  conversationId: 'conv-1',
  modelId: 'deterministic',
  toolNames: ['getTaskContext'],
  currentUserText: '本轮唯一指令：按川西环线建团',
  businessFacts: { taskId: 'task-1', routeName: '川西环线' },
  unresolvedState: { hasPendingReview: false, reviewPackageId: null },
  materials: [],
}

describe('planContextCompaction', () => {
  it('短会话不压缩，当前指令与业务事实保持原文', () => {
    const events = [
      { sequence: 1, kind: 'user_message', payload: { text: '最早的问题' } },
      { sequence: 2, kind: 'agent_message', payload: { text: '最早的回复' } },
      { sequence: 3, kind: 'user_message', payload: { text: '本轮唯一指令：按川西环线建团' } },
    ]
    const plan = planContextCompaction({
      ...plannerBase,
      conversationVersion: 3,
      currentUserMessageSequence: 3,
      events,
    })
    expect(plan.useSummary).toBe(false)
    expect(plan.persist).toBe(false)
    expect(plan.record).toBeNull()
    expect(plan.originProjection.conversationBackground.summary).toBeNull()
  })

  it('历史达到缓冲阈值时持久化版本，本轮仍用原文', () => {
    const events = bulkyEventsForHistoryRatio(
      (CONTEXT_COMPACTION_BUFFER_RATIO + CONTEXT_COMPACTION_ACTIVATE_RATIO) / 2,
    )
    const { dynamicBudgetTokens } = measureStaticContextBudget({
      modelId: plannerBase.modelId,
      toolNames: plannerBase.toolNames,
    })
    const historyTokens = historyTokensOf(events)
    expect(historyTokens).toBeGreaterThanOrEqual(dynamicBudgetTokens * CONTEXT_COMPACTION_BUFFER_RATIO)
    expect(historyTokens).toBeLessThan(dynamicBudgetTokens * CONTEXT_COMPACTION_ACTIVATE_RATIO)
    const plan = planContextCompaction({
      ...plannerBase,
      conversationVersion: 20,
      currentUserMessageSequence: 20,
      events: [
        ...events,
        { sequence: 20, kind: 'user_message', payload: { text: plannerBase.currentUserText } },
      ],
    })
    expect(plan.originalFits).toBe(true)
    expect(plan.record).not.toBeNull()
    expect(plan.persist).toBe(true)
    expect(plan.useSummary).toBe(false)
    expect(plan.originProjection.conversationBackground.summary).toBeNull()
    expect(plan.record?.coveredEventSequences).toHaveLength(
      events.length - CONTEXT_COMPACTION_KEEP_TAIL,
    )
  })

  it('历史达到激活阈值时用摘要替换已覆盖原文，并保留近期尾部', () => {
    const events = bulkyEventsForHistoryRatio(CONTEXT_COMPACTION_ACTIVATE_RATIO + 0.05)
    const plan = planContextCompaction({
      ...plannerBase,
      conversationVersion: 20,
      currentUserMessageSequence: 20,
      events: [
        ...events,
        { sequence: 20, kind: 'user_message', payload: { text: plannerBase.currentUserText } },
      ],
    })
    expect(plan.originalFits).toBe(true)
    expect(plan.useSummary).toBe(true)
    expect(plan.persist).toBe(true)
    const projection = applyCompactionPlan(plan, events, 20, [], {
      currentUserMessageSequence: 20,
      summaryVersion: 3,
    })
    expect(projection.conversationBackground.summaryVersion).toBe(3)
    expect(projection.conversationBackground.summary).toContain(CONTEXT_COMPACTION_DISCLAIMER)
    expect(projection.recentTail.every((event) => !plan.record?.coveredEventSequences.includes(event.sequence))).toBe(
      true,
    )
    expect(projection.recentTail.length).toBeGreaterThan(0)
  })

  it('同一冻结输入的 inputDigest 命中已完成版本时不再写入', () => {
    const events = bulkyEventsForHistoryRatio(
      (CONTEXT_COMPACTION_BUFFER_RATIO + CONTEXT_COMPACTION_ACTIVATE_RATIO) / 2,
    )
    const first = planContextCompaction({
      ...plannerBase,
      conversationVersion: 20,
      currentUserMessageSequence: 20,
      events,
    })
    const replay = planContextCompaction({
      ...plannerBase,
      conversationVersion: 20,
      currentUserMessageSequence: 20,
      events,
      existingCompleted: {
        version: 2,
        inputDigest: first.record?.inputDigest ?? '',
        policyVersion: first.record?.policyVersion ?? '',
      },
    })
    expect(replay.persist).toBe(false)
    expect(replay.record?.inputDigest).toBe(first.record?.inputDigest)
  })

  it('摘要声称的路线不能覆盖当前业务事实', () => {
    const compacted = compactConversationEvents({
      conversationId: 'conv-1',
      conversationVersion: 20,
      currentUserMessageSequence: 20,
      events: bulkyEvents(20, 80, 20).map((event) => ({
        sequence: event.sequence,
        kind: event.kind,
        text: '历史消息说路线按喀纳斯三日',
      })),
    })
    const budgeted = buildBudgetedContext({
      modelId: 'deterministic',
      toolNames: ['getTaskContext'],
      currentUserText: '本轮唯一指令',
      businessFacts: { taskId: 'task-1', routeName: '川西环线' },
      unresolvedState: { hasPendingReview: true, reviewPackageId: 'pkg-1' },
      projection: {
        conversationBackground: {
          summary: compacted?.summary ?? '喀纳斯三日',
          summaryVersion: 1,
        },
        recentTail: [],
        pinnedMaterials: [],
        truncationReasons: [],
      },
    })
    const factsBlock = budgeted.userText.slice(
      budgeted.userText.indexOf('【当前业务事实】'),
      budgeted.userText.indexOf('【未决交互】'),
    )
    const backgroundBlock = budgeted.userText.slice(
      budgeted.userText.indexOf('【交流背景】'),
      budgeted.userText.indexOf('【近期对话】'),
    )
    expect(factsBlock).toContain('川西环线')
    expect(factsBlock).not.toContain('喀纳斯三日')
    expect(backgroundBlock).toContain('喀纳斯三日')
    expect(backgroundBlock).toContain(CONTEXT_COMPACTION_DISCLAIMER)
    expect(budgeted.userText).toContain('pkg-1')
    expect(budgeted.userText).toContain('本轮唯一指令')
    expect(budgeted.sections.find((section) => section.key === 'system_constraints')?.estimatedTokens).toBeGreaterThan(
      0,
    )
    expect(budgeted.sections.find((section) => section.key === 'system_constraints')?.sha256).not.toBe(
      budgeted.sections.find((section) => section.key === 'conversation_summary')?.sha256,
    )
  })
})

describe('persistCompletedCompactionVersion', () => {
  it('同一 inputDigest 跨实例复用已完成版本号', async () => {
    const created: Array<{ inputDigest: string; version: number; status: string }> = [
      { inputDigest: 'digest-a', version: 1, status: 'completed' },
    ]
    const tx = {
      aiContextCompactionVersion: {
        findFirst: async ({
          where,
        }: {
          where: { inputDigest: string }
        }) => created.find((row) => row.inputDigest === where.inputDigest) ?? null,
        aggregate: async () => ({ _max: { version: 1 } }),
        create: async ({ data }: { data: { inputDigest: string; version: number } }) => {
          created.push({ ...data, status: 'completed' })
          return data
        },
        update: async () => ({}),
      },
    }
    const left = await persistCompletedCompactionVersion(tx as never, {
      organizationId: 'org-1',
      conversationId: 'conv-1',
      record: {
        policyVersion: 'deterministic-event-index/v1',
        configVersion: 'locator-excerpt-80/v1',
        modelId: 'deterministic',
        conversationVersionCeiling: 20,
        coveredSequenceStart: 1,
        coveredSequenceEnd: 11,
        coveredEventSequences: [1, 2],
        locators: [],
        summary: '摘要',
        digest: 'd'.repeat(64),
        inputDigest: 'digest-a',
      },
    })
    const right = await persistCompletedCompactionVersion(tx as never, {
      organizationId: 'org-1',
      conversationId: 'conv-1',
      record: {
        policyVersion: 'deterministic-event-index/v1',
        configVersion: 'locator-excerpt-80/v1',
        modelId: 'deterministic',
        conversationVersionCeiling: 20,
        coveredSequenceStart: 1,
        coveredSequenceEnd: 11,
        coveredEventSequences: [1, 2],
        locators: [],
        summary: '摘要',
        digest: 'd'.repeat(64),
        inputDigest: 'digest-a',
      },
    })
    expect(left.version).toBe(1)
    expect(right.version).toBe(1)
    expect(created).toHaveLength(1)
  })
})

describe('压缩版本与 Manifest 证据隔离', () => {
  it('被摘要覆盖的 sequence 不进入 Manifest，不能当作用户消息证据', () => {
    const events = bulkyEvents(20, 80, 20)
    const projection = buildFrozenProjection({
      events,
      conversationVersion: 20,
      currentUserMessageSequence: 20,
      materials: [],
      compaction: {
        summary: '摘要',
        summaryVersion: 4,
        coveredEventSequences: events.slice(0, events.length - CONTEXT_COMPACTION_KEEP_TAIL).map(
          (event) => event.sequence,
        ),
      },
    })
    const sequences = eventSequencesForModelInput(projection.recentTail, 20)
    expect(sequences).not.toContain(1)
    expect(sequences).toContain(20)
    const manifest = buildContextManifest({
      conversationId: 'conv-1',
      inputBatchId: 'batch-1',
      conversationVersion: 20,
      eventSequences: sequences,
      businessSnapshotVersion: 1,
      modelId: 'deterministic',
      materialVersions: [],
      excerptDigests: [],
      inputHash: 'a'.repeat(64),
      budget: buildBudgetedContext({
        modelId: 'deterministic',
        toolNames: ['getTaskContext'],
        currentUserText: '本轮',
        businessFacts: {},
        unresolvedState: {},
        projection,
      }).budget,
      sections: [],
      summaryVersion: 4,
    })
    expect(manifest.summaryVersion).toBe(4)
    expect(manifest.toolSchemaVersion).toBe(PLAINTEXT_TOOL_SCHEMA_VERSION)
    expect(manifest.eventSequences).not.toContain(1)
  })
})

describe('resolvePreparedProjection', () => {
  const bufferEvents = () => bulkyEventsForHistoryRatio(
    (CONTEXT_COMPACTION_BUFFER_RATIO + CONTEXT_COMPACTION_ACTIVATE_RATIO) / 2,
  )

  it('Worker 重启或跨实例后续跑时复用已完成压缩版本', async () => {
    const events = bulkyEventsForHistoryRatio(CONTEXT_COMPACTION_ACTIVATE_RATIO + 0.05)
    const record = compactConversationEvents({
      conversationId: plannerBase.conversationId,
      conversationVersion: 20,
      currentUserMessageSequence: 20,
      events: events.map((event) => ({
        sequence: event.sequence,
        kind: event.kind,
        text: event.payload.text,
      })),
    })
    const { prisma, created } = compactionTx({
      existing: {
        version: 7,
        inputDigest: record?.inputDigest ?? '',
        policyVersion: record?.policyVersion ?? '',
        status: 'completed',
      },
    })
    const resolved = await resolvePreparedProjection(prisma as never, {
      ...plannerBase,
      organizationId: 'org-1',
      conversationVersion: 20,
      currentUserMessageSequence: 20,
      events: [
        ...events,
        { sequence: 20, kind: 'user_message', payload: { text: plannerBase.currentUserText } },
      ],
    })
    expect(created).toHaveLength(0)
    expect(resolved.plan.persist).toBe(false)
    expect(resolved.plan.useSummary).toBe(true)
    expect(resolved.plan.record?.inputDigest).toBe(record?.inputDigest)
    expect(resolved.summaryVersion).toBe(7)
    expect(resolved.projection.conversationBackground.summaryVersion).toBe(7)
    expect(resolved.projection.conversationBackground.summary).toContain(CONTEXT_COMPACTION_DISCLAIMER)
  })

  it('摘要写入失败且原文仍放得下时回退到原文投影', async () => {
    const events = bufferEvents()
    const { prisma } = compactionTx({ failWrite: true })
    const resolved = await resolvePreparedProjection(prisma as never, {
      ...plannerBase,
      organizationId: 'org-1',
      conversationVersion: 20,
      currentUserMessageSequence: 20,
      events: [
        ...events,
        { sequence: 20, kind: 'user_message', payload: { text: plannerBase.currentUserText } },
      ],
    })
    expect(resolved.plan.useSummary).toBe(false)
    expect(resolved.plan.persist).toBe(false)
    expect(resolved.projection.conversationBackground.summary).toBeNull()
    expect(resolved.summaryVersion).toBeNull()
  })

  it('当前指令本身超出预算时标记 currentInputOverflow，交由分块索引而不是直接容量失败', async () => {
    const events = bulkyEventsForHistoryRatio(CONTEXT_COMPACTION_ACTIVATE_RATIO + 0.05)
    const { prisma } = compactionTx({ failWrite: true })
    const resolved = await resolvePreparedProjection(prisma as never, {
      ...plannerBase,
      organizationId: 'org-1',
      conversationVersion: 20,
      currentUserMessageSequence: 20,
      currentUserText: `本轮唯一指令：${'甲'.repeat(80_000)}`,
      events: [
        ...events,
        { sequence: 20, kind: 'user_message', payload: { text: `本轮唯一指令：${'甲'.repeat(80_000)}` } },
      ],
    })
    expect(resolved.plan.currentInputOverflow).toBe(true)
    expect(resolved.plan.useSummary).toBe(false)
  })
})

describe('CONTEXT_PREPARE_FAILED', () => {
  it('不是立即失败码，供 Worker 重试准备', () => {
    expect(CONTEXT_PREPARE_FAILED).toBe('CONTEXT_PREPARE_FAILED')
    expect(CONTEXT_PREPARE_FAILED).not.toBe(CONTEXT_CAPACITY_EXCEEDED)
  })
})
