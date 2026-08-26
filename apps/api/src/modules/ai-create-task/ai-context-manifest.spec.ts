import { CONVERSATION_GENERAL_INSTRUCTIONS } from '@xiaotuanbao/ai-contracts'
import { buildBudgetedContext } from './ai-context-budget'
import {
  buildContextManifest,
  buildFrozenProjection,
  digestExcerpt,
  eventSequencesForModelInput,
  excerptDigestsFor,
  isConfirmedReviewContinuation,
  parseEventSequences,
  projectConversationEventsForAgent,
  resolveAttemptUserText,
  selectPlaintextContextEvents,
} from './ai-context-manifest'
import {
  CONVERSATION_GENERAL_SYSTEM_PROMPT_VERSION,
  CONVERSATION_GENERAL_TOOL_SCHEMA_VERSION,
  PLAINTEXT_SYSTEM_PROMPT_VERSION,
  PLAINTEXT_TOOL_SCHEMA_VERSION,
  REVIEW_CONFIRM_CONTINUATION_TEXT,
} from './ai-conversation.constants'

describe('projectConversationEventsForAgent', () => {
  it('projects pinned User plaintext and drops unknown event kinds', () => {
    expect(
      projectConversationEventsForAgent([
        { sequence: 1, kind: 'user_message', payload: { text: '  帮我建一个喀纳斯3日团  ' } },
        { sequence: 2, kind: 'batch_status', payload: { batchId: 'batch-1', status: 'agent_running' } },
        { sequence: 3, kind: 'hidden_reasoning', payload: { text: 'should not leak' } },
      ]),
    ).toEqual([
      { sequence: 1, kind: 'user_message', text: '帮我建一个喀纳斯3日团' },
      { sequence: 2, kind: 'batch_status' },
    ])
  })

  it('keeps prior user and agent turns in the next attempt context', () => {
    const selected = selectPlaintextContextEvents(
      [
        { sequence: 1, kind: 'user_message', payload: { text: '路线按川西环线，日期还没定' } },
        { sequence: 2, kind: 'batch_status', payload: { status: 'completed' } },
        { sequence: 3, kind: 'agent_message', payload: { text: '出团日期是哪一天？' } },
        { sequence: 4, kind: 'user_message', payload: { text: '另外预计人数大概20人' } },
      ],
      4,
    )
    const projected = projectConversationEventsForAgent(selected)

    expect(projected.map((event) => event.text)).toEqual([
      '路线按川西环线，日期还没定',
      '出团日期是哪一天？',
      '另外预计人数大概20人',
    ])
    expect(
      selectPlaintextContextEvents(
        [
          { sequence: 1, kind: 'user_message', payload: { text: '路线按川西环线，日期还没定' } },
          { sequence: 3, kind: 'agent_message', payload: { text: '出团日期是哪一天？' } },
          { sequence: 4, kind: 'user_message', payload: { text: '另外预计人数大概20人' } },
          { sequence: 6, kind: 'user_message', payload: { text: '认领后才出现的消息' } },
        ],
        4,
      ).map((event) => event.sequence),
    ).toEqual([1, 3, 4])
  })

  it('omits later queued user turns from a confirmed review continuation snapshot', () => {
    expect(
      selectPlaintextContextEvents(
        [
          { sequence: 1, kind: 'user_message', payload: { text: '请按这个团名建团' } },
          { sequence: 3, kind: 'agent_message', payload: { text: '已提交待审核建议，请在中间表单确认。' } },
          { sequence: 5, kind: 'user_message', payload: { text: '审核期间补一句' } },
          { sequence: 7, kind: 'batch_status', payload: { status: 'completed', disposition: 'confirmed' } },
        ],
        7,
        1,
      ).map((event) => event.sequence),
    ).toEqual([1, 3])
  })

  it('reads integer event sequences from the ContextManifest JSON', () => {
    expect(parseEventSequences([1, 2, '3', 0, -1, 4.5, 3])).toEqual([1, 2, 3])
    expect(parseEventSequences({ sequences: [1] })).toEqual([])
  })

  it('记录 recent tail 与 current input 的实际来源序号，并去重排序', () => {
    expect(eventSequencesForModelInput([{ sequence: 3 }, { sequence: 1 }], 4)).toEqual([1, 3, 4])
    expect(eventSequencesForModelInput([{ sequence: 3 }, { sequence: 4 }], 4)).toEqual([3, 4])
  })
})

describe('resolveAttemptUserText', () => {
  it('detects review continuation from the frozen event instead of comparing message text', () => {
    expect(
      isConfirmedReviewContinuation({
        kind: 'batch_status',
        payload: { status: 'completed', disposition: 'confirmed' },
      }),
    ).toBe(true)
    expect(
      isConfirmedReviewContinuation({
        kind: 'user_message',
        payload: { text: REVIEW_CONFIRM_CONTINUATION_TEXT },
      }),
    ).toBe(false)
  })

  it('replaces the original request after a confirmed review continuation', () => {
    expect(
      resolveAttemptUserText('请按这个团名建团', {
        kind: 'batch_status',
        payload: { status: 'completed', disposition: 'confirmed' },
      }),
    ).toBe(REVIEW_CONFIRM_CONTINUATION_TEXT)
  })

  it('keeps the original request for a normal user turn', () => {
    expect(resolveAttemptUserText('请按这个团名建团', null)).toBe('请按这个团名建团')
    expect(
      resolveAttemptUserText('请按这个团名建团', {
        kind: 'user_message',
        payload: { text: '请按这个团名建团' },
      }),
    ).toBe('请按这个团名建团')
  })
})

describe('frozen context projection', () => {
  it('injects the current User event only as current input, never in the recent tail', () => {
    const projection = buildFrozenProjection({
      events: [
        { sequence: 1, kind: 'user_message', payload: { text: '上一轮问题' } },
        { sequence: 2, kind: 'agent_message', payload: { text: '上一轮回复' } },
        { sequence: 3, kind: 'user_message', payload: { text: '本轮唯一指令' } },
      ],
      conversationVersion: 3,
      originUserMessageSequence: 3,
      currentUserMessageSequence: 3,
      materials: [],
    })

    expect(projection.recentTail.map((event) => event.sequence)).toEqual([1, 2])
  })

  it('只冻结完整候选区段，把唯一裁剪决策留给统一 Token 预算模块', () => {
    const filler = '甲'.repeat(8_000)
    const projection = buildFrozenProjection({
      events: [
        { sequence: 1, kind: 'user_message', payload: { text: '第一句' } },
        { sequence: 2, kind: 'agent_message', payload: { text: filler } },
        { sequence: 3, kind: 'agent_message', payload: { text: filler } },
      ],
      conversationVersion: 3,
      materials: [],
    })

    expect(projection.recentTail.map((event) => event.sequence)).toEqual([1, 2, 3])
    expect(projection.truncationReasons).toEqual([])
  })

  it('persists the exact budgeted model input hash and section usage', () => {
    const input = {
      conversationId: 'conv-1',
      inputBatchId: 'batch-1',
      conversationVersion: 4,
      eventSequences: [1, 3, 4],
      businessSnapshotVersion: 2,
      modelId: 'deterministic',
      materialVersions: [{ materialId: 'mat-1', parseResultVersion: 1 }],
      excerptDigests: excerptDigestsFor([
        {
          materialId: 'mat-1',
          parseResultVersion: 1,
          status: 'ready' as const,
          pageCount: 1,
          excerpt: '喀纳斯',
          truncated: false,
        },
      ]),
      truncationReasons: [] as string[],
      inputHash: 'a'.repeat(64),
      budget: {
        profileVersion: 'test/v1',
        estimatorVersion: 'test-estimator/v1',
        providerFramingVersion: 'test-framing/v1',
        outputReserveVersion: 'test-output/v1',
        tokenLimiterProcessorVersion: 'mastra-token-limiter-contiguous/v1',
        tokenLimiterTrimMode: 'contiguous' as const,
        contextWindowTokens: 100,
        softInputLimitTokens: 80,
        outputReserveTokens: 10,
        providerFramingTokens: 2,
        safetyMarginTokens: 8,
        tokenLimiterLimitTokens: 90,
        staticInputTokens: 10,
        dynamicBudgetTokens: 60,
        estimatedInputTokens: 30,
        overSoftLimit: false,
      },
      sections: [
        {
          key: 'assembled_user_message' as const,
          version: null,
          estimatedTokens: 20,
          sha256: 'b'.repeat(64),
        },
      ],
    }
    const left = buildContextManifest(input)
    const right = buildContextManifest(input)
    expect(left.inputHash).toBe(right.inputHash)
    expect(left.inputHash).toBe('a'.repeat(64))
    expect(left.budget.estimatorVersion).toBe('test-estimator/v1')
    expect(left.sections[0]?.sha256).toBe('b'.repeat(64))
    expect(left.summaryVersion).toBeNull()
    expect(left.sourceIndexVersion).toBeNull()
    expect(left.excerptDigests[0]?.sha256).toBe(digestExcerpt('喀纳斯'))
  })

  it('does not pull events after the frozen conversation version into the projection', () => {
    const projection = buildFrozenProjection({
      events: [
        { sequence: 1, kind: 'user_message', payload: { text: '本会话' } },
        { sequence: 2, kind: 'agent_message', payload: { text: '收到' } },
        { sequence: 9, kind: 'user_message', payload: { text: '其他会话或未冻结消息' } },
      ],
      conversationVersion: 2,
      materials: [
        {
          materialId: 'other-mat',
          parseResultVersion: 9,
          status: 'ready',
          pageCount: 1,
          excerpt: '不应出现除非被 pinned',
          truncated: false,
        },
      ],
    })
    expect(projection.recentTail.map((event) => event.sequence)).toEqual([1, 2])
    expect(projection.conversationBackground.summary).toBeNull()
  })

  it('无任务会话 Manifest 记录 conversation.general 的 prompt 与回读工具版本，而不是建团 readonly-assist', () => {
    const budgeted = buildBudgetedContext({
      modelId: 'deterministic',
      toolNames: ['readConversationHistory', 'readConversationSource'],
      systemInstructions: CONVERSATION_GENERAL_INSTRUCTIONS,
      systemPromptVersion: CONVERSATION_GENERAL_SYSTEM_PROMPT_VERSION,
      toolSchemaVersion: CONVERSATION_GENERAL_TOOL_SCHEMA_VERSION,
      currentUserText: '今天合作伙伴账款怎么查？',
      businessFacts: { conversationId: 'conv-1' },
      unresolvedState: { hasPendingReview: false, reviewPackageId: null },
      projection: {
        conversationBackground: { summary: null, summaryVersion: null },
        recentTail: [],
        pinnedMaterials: [],
        truncationReasons: [],
      },
    })
    const manifest = buildContextManifest({
      conversationId: 'conv-1',
      inputBatchId: 'batch-1',
      conversationVersion: 1,
      eventSequences: [1],
      businessSnapshotVersion: 0,
      modelId: 'deterministic',
      materialVersions: [],
      excerptDigests: [],
      truncationReasons: budgeted.truncationReasons,
      inputHash: budgeted.inputHash,
      budget: budgeted.budget,
      sections: budgeted.sections,
    })

    expect(manifest.systemPromptVersion).toBe('conversation-general/v2')
    expect(manifest.toolSchemaVersion).toBe('conversation-general-recall/v1')
    expect(manifest.systemPromptVersion).not.toBe(PLAINTEXT_SYSTEM_PROMPT_VERSION)
    expect(manifest.toolSchemaVersion).not.toBe(PLAINTEXT_TOOL_SCHEMA_VERSION)
    expect(manifest.sections.find((section) => section.key === 'system_constraints')?.sha256).toBe(
      digestExcerpt(CONVERSATION_GENERAL_INSTRUCTIONS),
    )
  })
})
