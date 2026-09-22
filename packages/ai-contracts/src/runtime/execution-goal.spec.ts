import { AiCollaborationError } from '../errors/ai-collaboration-error'
import {
  AGENT_EXECUTION_GOALS,
  COMPLETION_BASIS_KINDS,
  agentExecutionGoalSchema,
  completionBasisSchema,
} from './execution-goal'
import {
  headlessExecutionRequestSchema,
  headlessExecutionResultSchema,
  validateHeadlessOutcomeAgainstGoal,
} from './headless-execution'

const identity = {
  conversationId: 'conversation-1',
  inputBatchId: 'batch-1',
  attemptId: 'attempt-1',
  contextManifestId: 'manifest-1',
}

const userTextSha256 = 'a'.repeat(64)

const reviewPackage = {
  objectVersion: 2,
  confirmationUnit: 'basic_info_draft' as const,
  candidates: [
    {
      fieldKey: 'name' as const,
      proposedValue: '八月川西团',
      clarity: 'clear' as const,
      evidence: [{ kind: 'user_message' as const, sequence: 1, excerpt: '团名叫八月川西团' }],
    },
  ],
}

describe('Agent execution goal and completion basis', () => {
  it('requires a structured execution goal on the headless request', () => {
    expect(AGENT_EXECUTION_GOALS).toEqual([
      'answer',
      'propose_change',
      'clarify',
      'governed_action',
    ])
    expect(
      headlessExecutionRequestSchema.parse({
        ...identity,
        userText: '今天合作伙伴账款怎么查？',
        userTextSha256,
        extra: 'strip',
        executionGoal: 'answer',
      }),
    ).toEqual({
      ...identity,
      userText: '今天合作伙伴账款怎么查？',
      userTextSha256,
      executionGoal: 'answer',
    })
    expect(() =>
      headlessExecutionRequestSchema.parse({
        ...identity,
        userText: '今天合作伙伴账款怎么查？',
        userTextSha256,
      }),
    ).toThrow()
    expect(() => agentExecutionGoalSchema.parse('continue_later')).toThrow()
  })

  it('replaces completed with answered and carries a matching completion basis', () => {
    expect(COMPLETION_BASIS_KINDS).toEqual([
      'final_answer',
      'accepted_review_package',
      'persistent_clarification',
      'governed_action_result',
    ])
    expect(
      headlessExecutionResultSchema.parse({
        kind: 'answered',
        message: '合作伙伴账款在财务菜单查看。',
        completionBasis: { kind: 'final_answer' },
        extra: 'strip',
      }),
    ).toEqual({
      kind: 'answered',
      message: '合作伙伴账款在财务菜单查看。',
      completionBasis: { kind: 'final_answer' },
    })
    expect(() =>
      headlessExecutionResultSchema.parse({
        kind: 'completed',
        message: '已根据当前资料整理出团基础信息。',
      }),
    ).toThrow()
    expect(() =>
      headlessExecutionResultSchema.parse({
        kind: 'answered',
        message: '合作伙伴账款在财务菜单查看。',
      }),
    ).toThrow()
    expect(() => completionBasisSchema.parse({ kind: 'display_text' })).toThrow()
  })

  it('maps AGENT_OUTCOME_INCOMPLETE to a non-retryable semantic failure', () => {
    const error = AiCollaborationError.fromCode('AGENT_OUTCOME_INCOMPLETE')
    expect(error.code).toBe('AGENT_OUTCOME_INCOMPLETE')
    expect(error.retryable).toBe(false)
    expect(error.message).toBe('这次处理没有形成可确认的结果，请重试或换一种说法')
    expect(
      headlessExecutionResultSchema.parse({
        kind: 'failed',
        error: error.toJSON(),
      }),
    ).toMatchObject({
      kind: 'failed',
      error: { code: 'AGENT_OUTCOME_INCOMPLETE', retryable: false },
    })
  })

  it('accepts an ordinary answer only with a non-empty final reply and no unresolved structured work', () => {
    expect(
      validateHeadlessOutcomeAgainstGoal({
        executionGoal: 'answer',
        outcome: {
          kind: 'answered',
          message: '合作伙伴账款在财务菜单查看。',
          completionBasis: { kind: 'final_answer' },
        },
      }),
    ).toEqual({
      kind: 'answered',
      message: '合作伙伴账款在财务菜单查看。',
      completionBasis: { kind: 'final_answer' },
    })
  })

  it('rejects an empty or whitespace-only answer as incomplete', () => {
    const result = validateHeadlessOutcomeAgainstGoal({
      executionGoal: 'answer',
      outcome: {
        kind: 'answered',
        message: '   ',
        completionBasis: { kind: 'final_answer' },
      },
    })
    expect(result).toMatchObject({
      kind: 'failed',
      error: { code: 'AGENT_OUTCOME_INCOMPLETE', retryable: false },
    })
  })

  it('rejects an answer that still has unresolved tool failures', () => {
    const result = validateHeadlessOutcomeAgainstGoal({
      executionGoal: 'answer',
      outcome: {
        kind: 'answered',
        message: '我先继续处理。',
        completionBasis: { kind: 'final_answer' },
        diagnostic: {
          usageSource: 'missing',
          toolSteps: [{ stepId: 'tool-1', toolName: 'getTaskContext', status: 'failed' }],
          modelSteps: [],
        },
      },
    })
    expect(result).toMatchObject({
      kind: 'failed',
      error: { code: 'AGENT_OUTCOME_INCOMPLETE', retryable: false },
    })
  })

  it('keeps an answered outcome when an earlier tool failure was retried successfully', () => {
    const result = validateHeadlessOutcomeAgainstGoal({
      executionGoal: 'answer',
      outcome: {
        kind: 'answered',
        message: '已读取资料。',
        completionBasis: { kind: 'final_answer' },
        diagnostic: {
          usageSource: 'missing',
          toolSteps: [
            {
              stepId: 'tool-1',
              toolCallId: 'call-1',
              toolName: 'getMaterialParseResult',
              status: 'failed',
            },
            {
              stepId: 'tool-2',
              toolCallId: 'call-2',
              toolName: 'getMaterialParseResult',
              status: 'succeeded',
            },
          ],
          modelSteps: [],
        },
      },
    })
    expect(result).toMatchObject({
      kind: 'answered',
      message: '已读取资料。',
      completionBasis: { kind: 'final_answer' },
    })
  })

  it('keeps an awaiting review when the same tool failed and then succeeded without call ids', () => {
    expect(
      validateHeadlessOutcomeAgainstGoal({
        executionGoal: 'propose_change',
        outcome: {
          kind: 'awaiting_review',
          reviewPackage,
          completionBasis: { kind: 'accepted_review_package' },
          diagnostic: {
            usageSource: 'missing',
            toolSteps: [
              { stepId: 'tool-1', toolName: 'getTaskContext', status: 'schema_rejected' },
              { stepId: 'tool-2', toolName: 'getTaskContext', status: 'succeeded' },
            ],
            modelSteps: [],
          },
        },
      }),
    ).toMatchObject({
      kind: 'awaiting_review',
      completionBasis: { kind: 'accepted_review_package' },
    })
  })

  it('still rejects a tool whose own last attempt failed even if another tool succeeded', () => {
    const result = validateHeadlessOutcomeAgainstGoal({
      executionGoal: 'answer',
      outcome: {
        kind: 'answered',
        message: '已读取资料。',
        completionBasis: { kind: 'final_answer' },
        diagnostic: {
          usageSource: 'missing',
          toolSteps: [
            { stepId: 'tool-1', toolCallId: 'parse-1', toolName: 'getMaterialParseResult', status: 'failed' },
            { stepId: 'tool-2', toolCallId: 'context-1', toolName: 'getTaskContext', status: 'succeeded' },
          ],
          modelSteps: [],
        },
      },
    })
    expect(result).toMatchObject({
      kind: 'failed',
      error: { code: 'AGENT_OUTCOME_INCOMPLETE', retryable: false },
    })
  })

  it('rejects propose_change that only returned display text', () => {
    const result = validateHeadlessOutcomeAgainstGoal({
      executionGoal: 'propose_change',
      outcome: {
        kind: 'answered',
        message: '我将继续处理团名修改。',
        completionBasis: { kind: 'final_answer' },
      },
    })
    expect(result).toMatchObject({
      kind: 'failed',
      error: { code: 'AGENT_OUTCOME_INCOMPLETE', retryable: false },
    })
  })

  it('accepts propose_change only after an accepted review package', () => {
    expect(
      validateHeadlessOutcomeAgainstGoal({
        executionGoal: 'propose_change',
        outcome: {
          kind: 'awaiting_review',
          reviewPackage,
          completionBasis: { kind: 'accepted_review_package' },
        },
      }),
    ).toMatchObject({
      kind: 'awaiting_review',
      completionBasis: { kind: 'accepted_review_package' },
    })
  })

  it('lets an ordinary answer wait for User input instead of forging completion', () => {
    expect(
      validateHeadlessOutcomeAgainstGoal({
        executionGoal: 'answer',
        outcome: {
          kind: 'awaiting_user_input',
          interaction: { type: 'free_text', prompt: '你希望新建发团，还是查询已有发团？' },
          completionBasis: { kind: 'persistent_clarification' },
        },
      }),
    ).toMatchObject({
      kind: 'awaiting_user_input',
      completionBasis: { kind: 'persistent_clarification' },
    })
  })

  it('lets propose_change wait for User input instead of forging a review', () => {
    expect(
      validateHeadlessOutcomeAgainstGoal({
        executionGoal: 'propose_change',
        outcome: {
          kind: 'awaiting_user_input',
          interaction: { type: 'free_text', prompt: '要改哪一天的出团日期？' },
          completionBasis: { kind: 'persistent_clarification' },
        },
      }),
    ).toMatchObject({
      kind: 'awaiting_user_input',
      completionBasis: { kind: 'persistent_clarification' },
    })
  })

  it('accepts clarify only with a persistent clarification', () => {
    expect(
      validateHeadlessOutcomeAgainstGoal({
        executionGoal: 'clarify',
        outcome: {
          kind: 'awaiting_user_input',
          interaction: { type: 'free_text', prompt: '出团日期是哪一天？' },
          completionBasis: { kind: 'persistent_clarification' },
        },
      }),
    ).toMatchObject({ kind: 'awaiting_user_input' })
    expect(
      validateHeadlessOutcomeAgainstGoal({
        executionGoal: 'clarify',
        outcome: {
          kind: 'answered',
          message: '请稍后补充日期。',
          completionBasis: { kind: 'final_answer' },
        },
      }),
    ).toMatchObject({
      kind: 'failed',
      error: { code: 'AGENT_OUTCOME_INCOMPLETE', retryable: false },
    })
  })

  it('accepts governed_action only with a governed action result', () => {
    expect(
      validateHeadlessOutcomeAgainstGoal({
        executionGoal: 'governed_action',
        outcome: {
          kind: 'registered_intent',
          intent: { key: 'task.departure-creation.requested', confidence: 'high', goal: '创建七月喀纳斯发团' },
          message: '正在准备建团任务。',
          completionBasis: { kind: 'governed_action_result' },
        },
      }),
    ).toMatchObject({
      kind: 'registered_intent',
      completionBasis: { kind: 'governed_action_result' },
    })
    expect(
      validateHeadlessOutcomeAgainstGoal({
        executionGoal: 'governed_action',
        outcome: {
          kind: 'answered',
          message: '将为你创建发团任务。',
          completionBasis: { kind: 'final_answer' },
        },
      }),
    ).toMatchObject({
      kind: 'failed',
      error: { code: 'AGENT_OUTCOME_INCOMPLETE', retryable: false },
    })
  })

  it('keeps explicit failed outcomes instead of rewriting them as incomplete', () => {
    const failed = {
      kind: 'failed' as const,
      error: AiCollaborationError.fromCode('PERMISSION_DENIED').toJSON(),
    }
    expect(
      validateHeadlessOutcomeAgainstGoal({
        executionGoal: 'answer',
        outcome: failed,
      }),
    ).toEqual(failed)
  })
})
