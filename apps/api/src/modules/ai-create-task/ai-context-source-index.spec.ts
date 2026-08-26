import {
  OVERSIZED_INPUT_CHUNKED_TRUNCATION,
  SOURCE_INDEX_DISCLAIMER,
} from '@xiaotuanbao/ai-contracts'
import { CONTEXT_CAPACITY_EXCEEDED, buildBudgetedContext } from './ai-context-budget'
import {
  CONTEXT_PREPARE_FAILED,
  planContextCompaction,
  resolvePreparedProjection,
} from './ai-context-compaction'
import { buildContextManifest } from './ai-context-manifest'
import { resolveModelCurrentInput } from './ai-context-source-index'

const origin = {
  kind: 'user_message' as const,
  conversationId: 'conv-1',
  eventId: 'event-1',
  sequence: 1,
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

function oversizedCurrentInput() {
  return `出团日期 2026-09-12。团费 12800元。姓名：张三。授权：可提交审核。${'甲'.repeat(80_000)}`
}

function sourceIndexTx(options?: { existing?: { version: number; inputDigest: string; policyVersion: string; status: string }; failWrite?: boolean }) {
  const created: Array<{ inputDigest: string; version: number }> = []
  return {
    created,
    prisma: {
      aiSourceIndexVersion: {
        findFirst: async () => options?.existing ?? null,
        aggregate: async () => ({ _max: { version: options?.existing?.version ?? 0 } }),
        create: async ({ data }: { data: { inputDigest: string; version: number } }) => {
          if (options?.failWrite) {
            throw new Error('source index store unavailable')
          }
          created.push({ inputDigest: data.inputDigest, version: data.version })
          return data
        },
        update: async ({ data }: { data: { inputDigest: string; version: number } }) => {
          if (options?.failWrite) {
            throw new Error('source index store unavailable')
          }
          created.push({ inputDigest: data.inputDigest, version: data.version })
          return data
        },
      },
    },
  }
}

describe('resolveModelCurrentInput', () => {
  it('当前输入放得下时保持原文，不写来源索引', async () => {
    const plan = planContextCompaction({
      ...plannerBase,
      conversationVersion: 1,
      currentUserMessageSequence: 1,
      events: [{ sequence: 1, kind: 'user_message', payload: { text: plannerBase.currentUserText } }],
    })
    const { prisma, created } = sourceIndexTx()
    const resolved = await resolveModelCurrentInput(prisma as never, {
      organizationId: 'org-1',
      conversationId: 'conv-1',
      inputBatchId: 'batch-1',
      origin,
      originalText: plannerBase.currentUserText,
      plan,
    })
    expect(plan.currentInputOverflow).toBe(false)
    expect(resolved.currentUserText).toBe(plannerBase.currentUserText)
    expect(resolved.sourceIndexVersion).toBeNull()
    expect(created).toEqual([])
  })

  it('超长当前输入完整保留原文摘要键，模型只看到带来源 locator 的索引投影', async () => {
    const originalText = oversizedCurrentInput()
    const plan = planContextCompaction({
      ...plannerBase,
      currentUserText: originalText,
      conversationVersion: 1,
      currentUserMessageSequence: 1,
      events: [{ sequence: 1, kind: 'user_message', payload: { text: originalText } }],
    })
    expect(plan.currentInputOverflow).toBe(true)
    const { prisma, created } = sourceIndexTx()
    const resolved = await resolveModelCurrentInput(prisma as never, {
      organizationId: 'org-1',
      conversationId: 'conv-1',
      inputBatchId: 'batch-1',
      origin,
      originalText,
      plan,
    })
    expect(resolved.currentUserText).toContain(SOURCE_INDEX_DISCLAIMER)
    expect(resolved.currentUserText).toContain('2026-09-12')
    expect(resolved.currentUserText).toContain('12800元')
    expect(resolved.currentUserText).not.toContain('甲'.repeat(200))
    expect(resolved.truncationReasons).toEqual([OVERSIZED_INPUT_CHUNKED_TRUNCATION])
    expect(created).toHaveLength(1)
    expect(resolved.record?.inputDigest).toHaveLength(64)
    expect(originalText).toContain('甲'.repeat(80_000))
    expect(() =>
      buildBudgetedContext({
        modelId: 'deterministic',
        toolNames: ['getTaskContext'],
        currentUserText: resolved.currentUserText,
        businessFacts: plannerBase.businessFacts,
        unresolvedState: plannerBase.unresolvedState,
        projection: {
          conversationBackground: { summary: null, summaryVersion: null },
          recentTail: [],
          pinnedMaterials: [],
          truncationReasons: resolved.truncationReasons,
        },
      }),
    ).not.toThrow()
    const budgeted = buildBudgetedContext({
      modelId: 'deterministic',
      toolNames: ['getTaskContext'],
      currentUserText: resolved.currentUserText,
      businessFacts: plannerBase.businessFacts,
      unresolvedState: plannerBase.unresolvedState,
      projection: {
        conversationBackground: { summary: null, summaryVersion: null },
        recentTail: [],
        pinnedMaterials: [],
        truncationReasons: resolved.truncationReasons,
      },
    })
    const manifest = buildContextManifest({
      conversationId: 'conv-1',
      inputBatchId: 'batch-1',
      conversationVersion: 1,
      eventSequences: [1],
      businessSnapshotVersion: 1,
      modelId: 'deterministic',
      materialVersions: [],
      excerptDigests: [],
      truncationReasons: budgeted.truncationReasons,
      inputHash: budgeted.inputHash,
      budget: budgeted.budget,
      sections: budgeted.sections,
      sourceIndexVersion: resolved.sourceIndexVersion,
    })
    expect(manifest.sourceIndexVersion).toBe(1)
    expect(manifest.truncationReasons).toContain(OVERSIZED_INPUT_CHUNKED_TRUNCATION)
  })

  it('同一原文 inputDigest 命中已完成版本时不再重复写入，也不产生业务 Action', async () => {
    const originalText = oversizedCurrentInput()
    const plan = planContextCompaction({
      ...plannerBase,
      currentUserText: originalText,
      conversationVersion: 1,
      currentUserMessageSequence: 1,
      events: [{ sequence: 1, kind: 'user_message', payload: { text: originalText } }],
    })
    const first = await resolveModelCurrentInput(sourceIndexTx().prisma as never, {
      organizationId: 'org-1',
      conversationId: 'conv-1',
      inputBatchId: 'batch-1',
      origin,
      originalText,
      plan,
    })
    const replayTx = sourceIndexTx({
      existing: {
        version: 4,
        inputDigest: first.record?.inputDigest ?? '',
        policyVersion: first.record?.policyVersion ?? '',
        status: 'completed',
      },
    })
    const replay = await resolveModelCurrentInput(replayTx.prisma as never, {
      organizationId: 'org-1',
      conversationId: 'conv-1',
      inputBatchId: 'batch-1',
      origin,
      originalText,
      plan,
    })
    expect(replay.sourceIndexVersion).toBe(4)
    expect(replayTx.created).toEqual([])
  })

  it('索引写入失败时进入可重试准备失败，不伪装成容量失败', async () => {
    const originalText = oversizedCurrentInput()
    const plan = planContextCompaction({
      ...plannerBase,
      currentUserText: originalText,
      conversationVersion: 1,
      currentUserMessageSequence: 1,
      events: [{ sequence: 1, kind: 'user_message', payload: { text: originalText } }],
    })
    await expect(
      resolveModelCurrentInput(sourceIndexTx({ failWrite: true }).prisma as never, {
        organizationId: 'org-1',
        conversationId: 'conv-1',
        inputBatchId: 'batch-1',
        origin,
        originalText,
        plan,
      }),
    ).rejects.toThrow(CONTEXT_PREPARE_FAILED)
    expect(CONTEXT_PREPARE_FAILED).not.toBe(CONTEXT_CAPACITY_EXCEEDED)
  })
})

describe('planContextCompaction oversized input', () => {
  it('强制业务事实本身放不下时仍失败为 CONTEXT_CAPACITY_EXCEEDED', async () => {
    await expect(
      resolvePreparedProjection(
        {
          aiContextCompactionVersion: {
            findFirst: async () => null,
            aggregate: async () => ({ _max: { version: 0 } }),
            create: async () => ({}),
            update: async () => ({}),
          },
        } as never,
        {
          ...plannerBase,
          organizationId: 'org-1',
          conversationVersion: 1,
          currentUserMessageSequence: 1,
          currentUserText: '短指令',
          businessFacts: { protectedFact: '甲'.repeat(80_000) },
          events: [{ sequence: 1, kind: 'user_message', payload: { text: '短指令' } }],
        },
      ),
    ).rejects.toThrow(CONTEXT_CAPACITY_EXCEEDED)
  })
})
