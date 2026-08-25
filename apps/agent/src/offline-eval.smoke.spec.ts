import {
  AI_CREATE_AGENT_DEFINITION_REF,
  CONVERSATION_GENERAL_AGENT_DEFINITION_REF,
  compareEvalReports,
  firstBatchEvalCatalog,
  runOfflineEval,
  submitReviewPackageModelInputSchema,
} from '@xiaotuanbao/ai-contracts'
import { createMastraHeadlessExecutor } from './mastra-headless.executor'

const IDENTITY = {
  taskId: 'task-1',
  conversationId: 'conversation-1',
  inputBatchId: 'batch-1',
  attemptId: 'attempt-1',
  contextManifestId: 'manifest-1',
  userText: '帮我建一个喀纳斯3日团',
  userTextSha256: 'a'.repeat(64),
}

const REVIEW_ARGS = {
  objectVersion: 2,
  confirmationUnit: 'basic_info_draft' as const,
  candidates: [
    {
      fieldKey: 'routeName' as const,
      proposedValue: '喀纳斯3日线',
      clarity: 'clear' as const,
      evidence: [{ kind: 'user_message' as const, sequence: 1, excerpt: '帮我建一个喀纳斯3日团' }],
    },
  ],
}

describe('真实 Mastra offline Eval smoke', () => {
  it('runs the Mastra headless executor and produces a comparable layered report', async () => {
    const started = Date.now()
    const executor = createMastraHeadlessExecutor({
      readUserText: async (request) => request.userText,
      generate: async () => ({
        text: '已提交待审核建议。',
        toolCalls: [{ toolName: 'submitReviewPackage', args: REVIEW_ARGS }],
      }),
    })
    const outcome = await executor(IDENTITY)
    const latencyMs = Date.now() - started
    expect(outcome.kind).toBe('awaiting_review')
    expect(outcome.diagnostic?.toolSteps).toEqual([
      expect.objectContaining({
        toolName: 'submitReviewPackage',
        capabilityKey: 'departure.review-package.propose',
        capabilityVersion: 1,
      }),
    ])
    expect(
      outcome.kind === 'awaiting_review' &&
        submitReviewPackageModelInputSchema.safeParse(outcome.reviewPackage).success,
    ).toBe(true)

    const input = {
      catalog: firstBatchEvalCatalog,
      observations: {
        'intent.taskless.plaintext': {
          selectedAgent: CONVERSATION_GENERAL_AGENT_DEFINITION_REF,
        },
        'tool.departure.get-task-context': {
          selectedTools: ['getTaskContext'],
        },
        'schema.review-package.valid': {
          schemaValid: true,
        },
        'token.usage-source.missing-estimated-actual': {
          usageSources: ['missing', 'estimated', 'actual'] as const,
        },
        'latency.within-budget': {
          latencyMs,
        },
        'golden.language.clarity': {},
        'model.explanation.clarity': { modelScore: 0.82 },
      },
      hardAssertions: [
        { id: 'permission.denied-must-block', passed: true, kind: 'permission' as const },
        { id: 'amount.must-match-domain', passed: true, kind: 'amount' as const },
        { id: 'idempotency.no-second-effect', passed: true, kind: 'idempotency' as const },
        { id: 'object-version.must-cas', passed: true, kind: 'object_version' as const },
        { id: 'business-effect.must-commit', passed: true, kind: 'business_effect' as const },
      ],
      golden: { caseId: 'golden.language.clarity', passed: true },
      modelScore: { judgeVersion: 'eval-judge@1', score: 0.82, notes: 'clear enough' },
    }

    const first = runOfflineEval(input)
    const second = runOfflineEval(input)
    expect(first.verdict).toBe('pass')
    expect(compareEvalReports(first, second)).toEqual({ equal: true, diffs: [] })
    expect(AI_CREATE_AGENT_DEFINITION_REF.key).toBe('departure.create')
  })
})
