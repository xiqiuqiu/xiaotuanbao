import {
  buildAuditablePlaintextContext,
  buildPlaintextContextManifest,
  buildRollingConversationSummary,
  RequiredContextBudgetExceededError,
  hasGroundedCandidateEvidence,
  composePlaintextUserText,
  parseEventSequences,
  projectConversationEventsForAgent,
  resolveAttemptUserText,
  resolveContextManifestIdentity,
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

describe('buildAuditablePlaintextContext #321', () => {
  const baseInput = {
    conversationId: 'conversation-1',
    inputBatchId: 'batch-1',
    conversationVersion: 4,
    originUserMessageSequence: 4,
    currentUserText: '以当前表单为准继续',
    events: [
      { sequence: 1, kind: 'user_message', payload: { text: '旧团名是雪山线' } },
      { sequence: 2, kind: 'agent_message', payload: { text: '已记录旧团名' } },
      { sequence: 4, kind: 'user_message', payload: { text: '以当前表单为准继续' } },
      { sequence: 6, kind: 'user_message', payload: { text: '认领后排队的消息' } },
    ],
    businessSnapshotVersion: 7,
    taskStatus: 'IN_PROGRESS',
    taskPhase: 'editing',
    businessSnapshot: { name: '当前团名', routeName: '川西环线' },
    reviewSnapshot: { packageId: 'review-1', version: 2, status: 'pending' },
    availableCapabilities: ['getTaskContext'],
    modelId: 'deterministic',
    materialVersions: [{ materialId: 'material-1', parseResultVersion: 3 }],
    materialFragmentRefs: ['material:material-1:parse:3:index'],
  } as const

  it('keeps current system facts outside lossy summary and excludes post-claim history', () => {
    const built = buildAuditablePlaintextContext({
      ...baseInput,
      summary: {
        id: 'summary-1',
        version: 1,
        throughSequence: 2,
        text: '团名是雪山线',
      },
    })

    expect(built.selectedEvents.map((event) => event.sequence)).toEqual([4])
    expect(built.userText).toContain('交流背景摘要，不可作为候选证据')
    expect(built.userText).toContain('以当前表单为准继续')
    expect(built.userText).not.toContain('认领后排队的消息')
    expect(built.manifest.businessSnapshot).toEqual({ name: '当前团名', routeName: '川西环线' })
    expect(built.manifest.summaryVersion).toBe(1)
  })

  it('applies independent summary/tail budgets and records deterministic trimming decisions', () => {
    const built = buildAuditablePlaintextContext({
      ...baseInput,
      summary: {
        id: 'summary-1',
        version: 2,
        throughSequence: 0,
        text: '摘要'.repeat(20),
      },
      budgets: {
        summaryTokens: 4,
        recentTailTokens: 8,
        materialTokens: 20,
        totalTokens: 500,
        mediaItems: 0,
      },
    })

    expect(built.manifest.truncationReasons).toEqual(
      expect.arrayContaining(['summary_token_budget', 'recent_tail_token_budget']),
    )
    expect(built.manifest.budgetUsage.summaryTokens).toBeLessThanOrEqual(4)
    expect(built.manifest.budgetUsage.recentTailTokens).toBeLessThanOrEqual(8)
  })

  it('never lets discretionary history, summary or materials exceed the total budget', () => {
    const built = buildAuditablePlaintextContext({
      ...baseInput,
      currentUserText: '继续',
      events: [
        { sequence: 1, kind: 'user_message', payload: { text: '旧团名' } },
        { sequence: 4, kind: 'user_message', payload: { text: '继续' } },
      ],
      businessSnapshot: {},
      reviewSnapshot: null,
      materialContentTokens: 12,
      summary: { id: 'summary-1', version: 1, throughSequence: 0, text: '摘要背景' },
      budgets: {
        summaryTokens: 4,
        recentTailTokens: 8,
        materialTokens: 8,
        totalTokens: 355,
        mediaItems: 0,
      },
    })

    expect(built.manifest.budgetUsage.totalTokens).toBeLessThanOrEqual(355)
    expect(built.manifest.truncationReasons).toContain('material_token_budget')
    expect(built.manifest.truncationReasons).toContain('total_token_budget')
  })

  it('rejects an authoritative context that alone exceeds the total budget', () => {
    expect(() =>
      buildAuditablePlaintextContext({
        ...baseInput,
        businessSnapshot: { name: '权威事实'.repeat(20) },
        reviewSnapshot: null,
        budgets: {
          summaryTokens: 4,
          recentTailTokens: 8,
          materialTokens: 8,
          totalTokens: 20,
          mediaItems: 0,
        },
      }),
    ).toThrow(RequiredContextBudgetExceededError)
  })

  it('hashes canonical snapshots reproducibly and changes manifest version inputs explicitly', () => {
    const first = buildPlaintextContextManifest({
      ...baseInput,
      eventSequences: [4],
      userText: '以当前表单为准继续',
      businessSnapshot: { routeName: '川西环线', name: '当前团名' },
      budgets: { summaryTokens: 1, recentTailTokens: 2, materialTokens: 3, totalTokens: 4, mediaItems: 0 },
      budgetUsage: { summaryTokens: 0, recentTailTokens: 2, materialTokens: 0, totalTokens: 2, mediaItems: 0 },
      summaryId: null,
      summaryVersion: null,
      materialFragmentRefs: [],
    })
    const second = buildPlaintextContextManifest({
      ...baseInput,
      eventSequences: [4],
      userText: '以当前表单为准继续',
      businessSnapshot: { name: '当前团名', routeName: '川西环线' },
      budgets: { summaryTokens: 1, recentTailTokens: 2, materialTokens: 3, totalTokens: 4, mediaItems: 0 },
      budgetUsage: { summaryTokens: 0, recentTailTokens: 2, materialTokens: 0, totalTokens: 2, mediaItems: 0 },
      summaryId: null,
      summaryVersion: null,
      materialFragmentRefs: [],
    })

    expect(second.inputHash).toBe(first.inputHash)
    expect(
      buildPlaintextContextManifest({
        ...baseInput,
        eventSequences: [4],
        userText: '以当前表单为准继续',
        businessSnapshot: { name: '新团名' },
        budgets: { summaryTokens: 1, recentTailTokens: 2, materialTokens: 3, totalTokens: 4, mediaItems: 0 },
        budgetUsage: { summaryTokens: 0, recentTailTokens: 2, materialTokens: 0, totalTokens: 2, mediaItems: 0 },
        summaryId: null,
        summaryVersion: null,
        materialFragmentRefs: [],
      }).inputHash,
    ).not.toBe(first.inputHash)
  })
})

describe('resolveContextManifestIdentity #321', () => {
  it('reuses the lowest version when the input hash already exists', () => {
    expect(
      resolveContextManifestIdentity(
        [
          { id: 'manifest-later', manifestVersion: 3, inputHash: 'same-hash' },
          { id: 'manifest-first', manifestVersion: 1, inputHash: 'same-hash' },
          { id: 'manifest-other', manifestVersion: 2, inputHash: 'other-hash' },
        ],
        'same-hash',
      ),
    ).toEqual({
      action: 'reuse',
      id: 'manifest-first',
      manifestVersion: 1,
    })
  })

  it('creates the next version when the input hash is new', () => {
    expect(
      resolveContextManifestIdentity(
        [
          { id: 'manifest-1', manifestVersion: 1, inputHash: 'old-hash' },
          { id: 'manifest-2', manifestVersion: 2, inputHash: 'older-hash' },
        ],
        'new-hash',
      ),
    ).toEqual({ action: 'create', manifestVersion: 3 })
  })

  it('creates version 1 when the batch has no manifests yet', () => {
    expect(resolveContextManifestIdentity([], 'first-hash')).toEqual({
      action: 'create',
      manifestVersion: 1,
    })
  })
})

describe('buildRollingConversationSummary #321', () => {
  it('compacts only the head and preserves a bounded recent tail as original events', () => {
    const events = Array.from({ length: 5 }, (_, index) => ({
      sequence: index + 1,
      kind: index % 2 === 0 ? 'user_message' : 'agent_message',
      payload: { text: `消息${index + 1}` },
    }))

    expect(
      buildRollingConversationSummary(null, events, 5, { retainedTailEvents: 2 }),
    ).toMatchObject({
      version: 1,
      throughSequence: 3,
      sourceEventSequences: [1, 2, 3],
      truncated: false,
    })
  })

  it('does not compact events newer than the claimed conversation version', () => {
    const result = buildRollingConversationSummary(
      null,
      [
        { sequence: 1, kind: 'user_message', payload: { text: '一' } },
        { sequence: 2, kind: 'agent_message', payload: { text: '二' } },
        { sequence: 5, kind: 'user_message', payload: { text: '认领后消息' } },
      ],
      2,
      { retainedTailEvents: 1 },
    )
    expect(result?.throughSequence).toBe(1)
    expect(result?.text).not.toContain('认领后消息')
  })

  it('does not summarize later queued User messages for a review continuation', () => {
    const result = buildRollingConversationSummary(
      null,
      [
        { sequence: 1, kind: 'user_message', payload: { text: '原始审核请求' } },
        { sequence: 2, kind: 'agent_message', payload: { text: '已提交审核' } },
        { sequence: 3, kind: 'user_message', payload: { text: '审核期间排队消息' } },
        { sequence: 4, kind: 'agent_message', payload: { text: '确认事件后的系统回复' } },
      ],
      4,
      { retainedTailEvents: 1, originUserMessageSequence: 1 },
    )
    expect(result?.text).toContain('原始审核请求')
    expect(result?.text).not.toContain('审核期间排队消息')
  })
})

describe('hasGroundedCandidateEvidence #321', () => {
  const sources = {
    userMessages: [{ id: 'event-1', text: '团名叫川西秋色线' }],
    materials: [
      {
        materialId: 'material-1',
        parseResultVersion: 3,
        pages: [{ pageNumber: 1, text: '出发日期为9月1日' }],
      },
    ],
    routeTemplates: [{ id: 'template-1', name: '川西秋色线' }],
    businessSnapshot: { startDate: '2026-09-01', name: '当前团名' },
    materialReads: new Set(['material-1:3:1']),
  }

  it('accepts only current manifest messages, system facts or pinned materials', () => {
    expect(
      hasGroundedCandidateEvidence(
        [{ evidence: [{ kind: 'user_message', excerpt: '川西秋色线' }] }],
        sources,
      ),
    ).toBe(true)
    expect(
      hasGroundedCandidateEvidence(
        [
          {
            fieldKey: 'endDate',
            proposedValue: '2026-09-05',
            evidence: [{ kind: 'system_derivation', rule: 'startDate plus 4 days' }],
          },
        ],
        sources,
      ),
    ).toBe(true)
    expect(
      hasGroundedCandidateEvidence(
        [
          {
            evidence: [
              {
                kind: 'material_region',
                materialId: 'material-1',
                pageNumber: 1,
                excerpt: '9月1日',
              },
            ],
          },
        ],
        sources,
      ),
    ).toBe(true)
    expect(
      hasGroundedCandidateEvidence(
        [
          {
            proposedValue: 'template-1',
            evidence: [
              { kind: 'system_derivation', rule: 'searchRouteTemplates:name_contains_token:川西' },
            ],
          },
        ],
        sources,
      ),
    ).toBe(true)
  })

  it('rejects a summary-only excerpt and an archived material outside this batch', () => {
    expect(
      hasGroundedCandidateEvidence(
        [{ evidence: [{ kind: 'user_message', excerpt: '摘要里的旧团名' }] }],
        sources,
      ),
    ).toBe(false)
    expect(
      hasGroundedCandidateEvidence(
        [
          {
            evidence: [
              {
                kind: 'material_region',
                materialId: 'material-old',
                pageNumber: 1,
                excerpt: '9月1日',
              },
            ],
          },
        ],
        sources,
      ),
    ).toBe(false)
    expect(
      hasGroundedCandidateEvidence(
        [
          {
            evidence: [
              {
                kind: 'material_region',
                materialId: 'material-1',
                pageNumber: 1,
                excerpt: '并不存在的内容',
              },
            ],
          },
        ],
        sources,
      ),
    ).toBe(false)
  })
})
