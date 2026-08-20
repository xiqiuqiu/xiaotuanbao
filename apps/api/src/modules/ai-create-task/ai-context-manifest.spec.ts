import {
  AGENT_MESSAGE_DROPPED_TRUNCATION,
  FROZEN_PROJECTION_TOTAL_CHARS,
} from '@xiaotuanbao/ai-contracts'
import {
  applyFrozenProjectionBudget,
  assembleFrozenUserText,
  buildContextManifest,
  buildFrozenProjection,
  composePlaintextUserText,
  digestExcerpt,
  excerptDigestsFor,
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

  it('drops older agent messages before clipping the current user text', () => {
    const filler = '甲'.repeat(8000)
    const budgeted = applyFrozenProjectionBudget(
      [
        { sequence: 1, kind: 'user_message', text: '第一句' },
        { sequence: 2, kind: 'agent_message', text: filler },
        { sequence: 3, kind: 'agent_message', text: filler },
        { sequence: 4, kind: 'user_message', text: '本批原文' },
      ],
      [
        {
          materialId: 'mat-1',
          parseResultVersion: 1,
          status: 'ready',
          pageCount: 1,
          excerpt: '乙'.repeat(4000),
          truncated: false,
        },
      ],
      4,
    )
    expect(budgeted.truncationReasons).toContain(AGENT_MESSAGE_DROPPED_TRUNCATION)
    expect(budgeted.recentTail.some((event) => event.kind === 'agent_message')).toBe(false)
    expect(budgeted.recentTail.map((event) => event.text)).toEqual(['第一句', '本批原文'])
    const chars =
      budgeted.recentTail.reduce((sum, event) => sum + (event.text?.length ?? 0), 0) +
      budgeted.pinnedMaterials.reduce((sum, item) => sum + item.excerpt.length, 0)
    expect(chars).toBeLessThanOrEqual(FROZEN_PROJECTION_TOTAL_CHARS)
  })

  it('hashes frozen references and ignores assembled prompt text', () => {
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
    }
    const left = buildContextManifest(input)
    const right = buildContextManifest(input)
    expect(left.inputHash).toBe(right.inputHash)
    expect(left.summaryVersion).toBeNull()
    expect(left.excerptDigests[0]?.sha256).toBe(digestExcerpt('喀纳斯'))
    expect(left.inputHash).not.toBe(
      buildContextManifest({ ...input, businessSnapshotVersion: 3 }).inputHash,
    )
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
