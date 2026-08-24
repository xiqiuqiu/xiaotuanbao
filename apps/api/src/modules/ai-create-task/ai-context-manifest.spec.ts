import {
  assembleFrozenUserText,
  buildContextManifest,
  buildFrozenProjection,
  composePlaintextUserText,
  digestExcerpt,
  excerptDigestsFor,
  isConfirmedReviewContinuation,
  parseEventSequences,
  projectConversationEventsForAgent,
  resolveAttemptUserText,
  selectPlaintextContextEvents,
} from './ai-context-manifest'
import { REVIEW_CONFIRM_CONTINUATION_TEXT } from './ai-conversation.constants'

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
      composePlaintextUserText(
        '另外预计人数大概20人',
        projected,
      ),
    ).toContain('出团日期是哪一天？')
    expect(
      composePlaintextUserText(
        '另外预计人数大概20人',
        projected,
      ),
    ).toContain('【交流背景】')
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
    const assembled = assembleFrozenUserText('本轮唯一指令', projection)
    expect(assembled.match(/本轮唯一指令/g)).toHaveLength(1)
  })

  it('assembles reserved empty background, recent tail and pinned materials once', () => {
    const assembled = assembleFrozenUserText('看下附件', {
      conversationBackground: { summary: null, summaryVersion: null },
      recentTail: [{ sequence: 1, kind: 'user_message', text: '看下附件' }],
      pinnedMaterials: [
        {
          materialId: 'mat-1',
          parseResultVersion: 2,
          status: 'ready',
          pageCount: 1,
          excerpt: '喀纳斯10日游',
          truncated: false,
        },
      ],
      truncationReasons: [],
    })
    expect(assembled).toContain('【交流背景】')
    expect(assembled).toContain('本阶段无滚动摘要')
    expect(assembled).toContain('【近期对话】')
    expect(assembled).toContain('【本批资料】')
    expect(assembled).toContain('资料 mat-1')
    expect(assembled).toContain('解析版本 2')
    expect(assembled).toContain('喀纳斯10日游')
    expect(assembled).toContain('【本轮指令】')
    expect(assembled).toContain('getMaterialParseResult')
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
        contextWindowTokens: 100,
        softInputLimitTokens: 80,
        outputReserveTokens: 10,
        providerFramingTokens: 2,
        safetyMarginTokens: 8,
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
})
