import { digestExcerpt } from './ai-context-manifest'
import { buildBudgetedContext } from './ai-context-budget'

describe('buildBudgetedContext', () => {
  it('统一计量首次模型输入、静态预留和每个动态区段', () => {
    const result = buildBudgetedContext({
      modelId: 'deterministic',
      toolNames: ['getTaskContext'],
      currentUserText: '本轮唯一指令',
      businessFacts: { taskId: 'task-1', objectVersion: 3, routeName: '川西环线' },
      unresolvedState: { hasPendingReview: false },
      projection: {
        conversationBackground: { summary: '此前讨论采用三日行程', summaryVersion: 2 },
        recentTail: [
          { sequence: 1, kind: 'user_message', text: '上一轮问题' },
          { sequence: 2, kind: 'agent_message', text: '上一轮回复' },
        ],
        pinnedMaterials: [],
        truncationReasons: [],
      },
    })

    expect(result.userText.match(/本轮唯一指令/g)).toHaveLength(1)
    expect(result.userText).toContain('"objectVersion":3')
    expect(result.userText).toContain('此前讨论采用三日行程')
    expect(result.budget.estimatorVersion).toBe('utf8-bytes-ceil-div3/v1')
    expect(result.budget.outputReserveTokens).toBeGreaterThan(0)
    expect(result.budget.providerFramingTokens).toBeGreaterThan(0)
    expect(result.sections.map((section) => section.key)).toEqual([
      'system_constraints',
      'tool_schemas',
      'business_facts',
      'unresolved_state',
      'conversation_summary',
      'recent_tail',
      'sources',
      'current_input',
      'assembled_user_message',
    ])
    expect(result.sections.at(-1)).toMatchObject({
      sha256: digestExcerpt(result.userText),
    })
    expect(result.inputHash).toHaveLength(64)
  })

  it('超出软预算时按来源、摘要、近期尾部顺序裁剪，保留当前命令与业务事实', () => {
    const currentUserText = `当前命令-${'甲'.repeat(7_500)}`
    const result = buildBudgetedContext({
      modelId: 'deepseek-chat',
      toolNames: [
        'getTaskContext',
        'searchRouteTemplates',
        'submitReviewPackage',
        'getMaterialParseResult',
      ],
      currentUserText,
      businessFacts: { taskId: 'task-1', protectedFact: '不得丢弃' },
      unresolvedState: { hasPendingReview: true, protectedReview: 'review-1' },
      projection: {
        conversationBackground: { summary: `摘要-${'乙'.repeat(12_000)}`, summaryVersion: 4 },
        recentTail: Array.from({ length: 12 }, (_, index) => ({
          sequence: index + 1,
          kind: index % 2 === 0 ? ('user_message' as const) : ('agent_message' as const),
          text: `历史-${index}-${'丙'.repeat(2_000)}`,
        })),
        pinnedMaterials: [
          {
            materialId: 'mat-1',
            parseResultVersion: 1,
            status: 'ready',
            pageCount: 1,
            excerpt: '丁'.repeat(2_400),
            truncated: false,
          },
        ],
        truncationReasons: [],
      },
    })

    expect(result.budget.overSoftLimit).toBe(false)
    expect(result.userText).toContain(currentUserText)
    expect(result.userText).toContain('不得丢弃')
    expect(result.userText).toContain('review-1')
    expect(result.truncationReasons).toEqual([
      'conversation_summary_budget',
      'recent_tail_budget',
      'sources_budget',
    ])
    expect(result.projection.pinnedMaterials[0]?.excerpt).toBe('')
    expect(result.projection.conversationBackground.summary).toBeNull()
    expect(result.projection.recentTail.length).toBeLessThan(12)
  })
})
