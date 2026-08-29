import { AI_CREATE_SYSTEM_INSTRUCTIONS, CONVERSATION_GENERAL_INSTRUCTIONS, CONVERSATION_RECALL_TOOL_NAMES } from '@xiaotuanbao/ai-contracts'
import { digestExcerpt } from './ai-context-manifest'
import { buildBudgetedContext } from './ai-context-budget'
import {
  CONVERSATION_GENERAL_SYSTEM_PROMPT_VERSION,
  CONVERSATION_GENERAL_TOOL_SCHEMA_VERSION,
  PLAINTEXT_SYSTEM_PROMPT_VERSION,
  PLAINTEXT_TOOL_SCHEMA_VERSION,
} from './ai-conversation.constants'

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
    expect(result.budget.tokenLimiterProcessorVersion).toBe('mastra-token-limiter-contiguous/v1')
    expect(result.budget.tokenLimiterTrimMode).toBe('contiguous')
    expect(result.budget.tokenLimiterLimitTokens).toBeGreaterThan(result.budget.softInputLimitTokens)
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
    expect(result.sections.find((section) => section.key === 'system_constraints')?.version).toBe(
      PLAINTEXT_SYSTEM_PROMPT_VERSION,
    )
    expect(result.sections.find((section) => section.key === 'tool_schemas')?.version).toBe(
      PLAINTEXT_TOOL_SCHEMA_VERSION,
    )
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
        'proposeReviewPackage',
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

  it('本批无附件时仍列出本会话可回读来源目录，不把摘录当全文', () => {
    const result = buildBudgetedContext({
      modelId: 'deterministic',
      toolNames: ['getTaskContext', 'getMaterialParseResult', 'readConversationSource'],
      currentUserText: '用刚才那份文件创建发团',
      businessFacts: { taskId: 'task-1' },
      unresolvedState: { hasPendingReview: false },
      projection: {
        conversationBackground: { summary: null, summaryVersion: null },
        recentTail: [
          { sequence: 1, kind: 'user_message', text: '看下这个文件中的线路信息' },
          { sequence: 6, kind: 'agent_message', text: '这份文件是赛里木湖1日' },
        ],
        pinnedMaterials: [],
        availableSources: [
          {
            materialId: 'src-1',
            parseResultVersion: 1,
            status: 'ready',
            pageCount: 1,
            excerpt: '【草稿】赛里木湖1日',
            truncated: true,
            originalFilename: '赛里木湖1日_草稿.pdf',
            requiredThisBatch: false,
          },
        ],
        truncationReasons: [],
      },
    })

    expect(result.userText).toContain('【本批资料】')
    expect(result.userText).toContain('（无）')
    expect(result.userText).toContain('【本会话来源】')
    expect(result.userText).toContain('src-1')
    expect(result.userText).toContain('解析版本 1')
    expect(result.userText).toContain('赛里木湖1日_草稿.pdf')
    expect(result.userText).toContain('再调用 readConversationSource 或 getMaterialParseResult')
  })

  it('本批已固定的来源只出现在【本批资料】，不在【本会话来源】重复列出', () => {
    const result = buildBudgetedContext({
      modelId: 'deterministic',
      toolNames: ['getTaskContext', 'getMaterialParseResult', 'readConversationSource'],
      currentUserText: '看这份附件',
      businessFacts: { taskId: 'task-1' },
      unresolvedState: { hasPendingReview: false },
      projection: {
        conversationBackground: { summary: null, summaryVersion: null },
        recentTail: [],
        pinnedMaterials: [
          {
            materialId: 'src-1',
            parseResultVersion: 1,
            status: 'ready',
            pageCount: 1,
            excerpt: '本批正文',
            truncated: false,
          },
        ],
        availableSources: [
          {
            materialId: 'src-1',
            parseResultVersion: 1,
            status: 'ready',
            pageCount: 1,
            excerpt: '本批正文',
            truncated: false,
            originalFilename: '本批.pdf',
            requiredThisBatch: true,
          },
          {
            materialId: 'src-2',
            parseResultVersion: 1,
            status: 'ready',
            pageCount: 1,
            excerpt: '上一轮正文',
            truncated: false,
            originalFilename: '上一轮.pdf',
            requiredThisBatch: false,
          },
        ],
        truncationReasons: [],
      },
    })

    expect(result.userText).toContain('资料 src-1')
    expect(result.userText).toContain('来源 src-2')
    expect(result.userText).not.toContain('来源 src-1')
  })

  it('追加任何实际模型输入都会改变 manifest input hash', () => {
    const base = {
      modelId: 'deterministic',
      toolNames: ['getTaskContext'],
      currentUserText: '建一个川西团',
      businessFacts: { taskId: 'task-1', objectVersion: 1 },
      unresolvedState: { hasPendingReview: false },
      projection: {
        conversationBackground: { summary: null, summaryVersion: null },
        recentTail: [],
        pinnedMaterials: [],
        truncationReasons: [],
      },
    }

    const before = buildBudgetedContext(base)
    const after = buildBudgetedContext({ ...base, currentUserText: `${base.currentUserText}。` })

    expect(after.inputHash).not.toBe(before.inputHash)
    expect(after.sections.find((section) => section.key === 'current_input')?.sha256).not.toBe(
      before.sections.find((section) => section.key === 'current_input')?.sha256,
    )
  })

  it('为每个实际模型选择显式版本化预算，拒绝未配置模型', () => {
    const input = {
      toolNames: ['getTaskContext'],
      currentUserText: '建团',
      businessFacts: {},
      unresolvedState: {},
      projection: {
        conversationBackground: { summary: null, summaryVersion: null },
        recentTail: [],
        pinnedMaterials: [],
        truncationReasons: [],
      },
    }

    const deterministic = buildBudgetedContext({ ...input, modelId: 'deterministic' })
    const deepseek = buildBudgetedContext({ ...input, modelId: 'deepseek/deepseek-chat' })
    const v4Flash = buildBudgetedContext({ ...input, modelId: 'deepseek/deepseek-v4-flash' })
    const v4FlashAlias = buildBudgetedContext({ ...input, modelId: 'deepseek-v4-flash' })

    expect(deterministic.budget.profileVersion).not.toBe(deepseek.budget.profileVersion)
    expect(v4Flash.budget.profileVersion).toBe('ai-create-deepseek-v4-flash-32k/v1')
    expect(v4FlashAlias.budget.profileVersion).toBe(v4Flash.budget.profileVersion)
    expect(() => buildBudgetedContext({ ...input, modelId: 'unknown/model' })).toThrow(
      'CONTEXT_PROFILE_MISSING',
    )
  })

  it('保护区段本身超过边界时终止，不把超额输入发给模型', () => {
    expect(() =>
      buildBudgetedContext({
        modelId: 'deterministic',
        toolNames: ['getTaskContext'],
        currentUserText: '甲'.repeat(40_000),
        businessFacts: { protectedFact: '不得丢弃' },
        unresolvedState: { protectedReview: 'review-1' },
        projection: {
          conversationBackground: { summary: null, summaryVersion: null },
          recentTail: [],
          pinnedMaterials: [],
          truncationReasons: [],
        },
      }),
    ).toThrow('CONTEXT_CAPACITY_EXCEEDED')
  })

  it('在动态预算边界允许等值，超出一个估算单位即终止', () => {
    const base = {
      modelId: 'deterministic',
      toolNames: ['getTaskContext'],
      currentUserText: '边界',
      businessFacts: {},
      unresolvedState: {},
      projection: {
        conversationBackground: { summary: null, summaryVersion: null },
        recentTail: [],
        pinnedMaterials: [],
        truncationReasons: [],
      },
    }
    const baseline = buildBudgetedContext(base)
    const baselineDynamicTokens = baseline.sections.find(
      (section) => section.key === 'assembled_user_message',
    )?.estimatedTokens
    if (baselineDynamicTokens == null) {
      throw new Error('缺少 assembled_user_message section')
    }
    const padding = baseline.budget.dynamicBudgetTokens - baselineDynamicTokens
    const atBoundary = buildBudgetedContext({
      ...base,
      currentUserText: `${base.currentUserText}${'甲'.repeat(padding)}`,
    })

    expect(atBoundary.budget.estimatedInputTokens).toBe(
      atBoundary.budget.staticInputTokens + atBoundary.budget.dynamicBudgetTokens,
    )
    expect(() =>
      buildBudgetedContext({
        ...base,
        currentUserText: `${base.currentUserText}${'甲'.repeat(padding + 1)}`,
      }),
    ).toThrow('CONTEXT_CAPACITY_EXCEEDED')
  })

  it('无任务会话按 conversation.general 计量指令与回读工具 schema，不复用建团 readonly-assist 版本', () => {
    const result = buildBudgetedContext({
      modelId: 'deterministic',
      toolNames: CONVERSATION_RECALL_TOOL_NAMES,
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

    expect(result.sections.find((section) => section.key === 'system_constraints')).toMatchObject({
      version: 'conversation-general/v5',
      sha256: digestExcerpt(CONVERSATION_GENERAL_INSTRUCTIONS),
    })
    expect(result.sections.find((section) => section.key === 'tool_schemas')).toMatchObject({
      version: 'conversation-general-routing-recall/v2',
    })
    expect(result.sections.find((section) => section.key === 'tool_schemas')?.sha256).not.toBe(
      digestExcerpt('[]'),
    )
    expect(result.sections.find((section) => section.key === 'system_constraints')?.sha256).not.toBe(
      digestExcerpt(AI_CREATE_SYSTEM_INSTRUCTIONS),
    )
    expect(result.sections.find((section) => section.key === 'system_constraints')?.version).not.toBe(
      PLAINTEXT_SYSTEM_PROMPT_VERSION,
    )
    expect(result.sections.find((section) => section.key === 'tool_schemas')?.version).not.toBe(
      PLAINTEXT_TOOL_SCHEMA_VERSION,
    )
  })

  it('更换实际 system prompt 会改变 input hash，供审计与回放区分 Agent Definition', () => {
    const base = {
      modelId: 'deterministic' as const,
      toolNames: [] as const,
      currentUserText: '今天合作伙伴账款怎么查？',
      businessFacts: { conversationId: 'conv-1' },
      unresolvedState: { hasPendingReview: false, reviewPackageId: null },
      projection: {
        conversationBackground: { summary: null, summaryVersion: null },
        recentTail: [],
        pinnedMaterials: [],
        truncationReasons: [],
      },
    }

    const aiCreate = buildBudgetedContext(base)
    const taskless = buildBudgetedContext({
      ...base,
      systemInstructions: CONVERSATION_GENERAL_INSTRUCTIONS,
      systemPromptVersion: CONVERSATION_GENERAL_SYSTEM_PROMPT_VERSION,
      toolSchemaVersion: CONVERSATION_GENERAL_TOOL_SCHEMA_VERSION,
    })

    expect(taskless.inputHash).not.toBe(aiCreate.inputHash)
  })
})
