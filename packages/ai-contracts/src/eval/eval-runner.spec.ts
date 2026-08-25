import { CONVERSATION_GENERAL_AGENT_DEFINITION_REF } from '../runtime/conversation-general-definitions'
import { firstBatchEvalCatalog } from './catalog'
import { compareEvalReports, runOfflineEval } from './runner'

describe('离线 Eval 基线', () => {
  it('catalogs first-batch scenarios for intent, tool choice, schema, token and latency', () => {
    expect(firstBatchEvalCatalog.map((scenario) => scenario.id)).toEqual([
      'intent.taskless.plaintext',
      'tool.departure.get-task-context',
      'schema.review-package.valid',
      'token.usage-source.missing-estimated-actual',
      'latency.within-budget',
      'golden.language.clarity',
      'model.explanation.clarity',
    ])
    expect(firstBatchEvalCatalog.every((scenario) => scenario.version === 1)).toBe(true)
    expect(new Set(firstBatchEvalCatalog.map((scenario) => scenario.layer))).toEqual(
      new Set(['hard', 'deterministic', 'golden', 'model']),
    )
  })

  it('fails the run when a hard assertion fails even if the model score is perfect', () => {
    const report = runOfflineEval({
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
          usageSources: ['missing', 'estimated', 'actual'],
        },
        'latency.within-budget': {
          latencyMs: 800,
        },
        'golden.language.clarity': {},
        'model.explanation.clarity': { modelScore: 1 },
      },
      hardAssertions: [
        { id: 'permission.denied-must-block', passed: false, kind: 'permission' },
        { id: 'amount.must-match-domain', passed: true, kind: 'amount' },
        { id: 'idempotency.no-second-effect', passed: true, kind: 'idempotency' },
        { id: 'object-version.must-cas', passed: true, kind: 'object_version' },
        { id: 'business-effect.must-commit', passed: true, kind: 'business_effect' },
      ],
      golden: { caseId: 'golden.language.clarity', passed: true },
      modelScore: { judgeVersion: 'eval-judge@1', score: 1, notes: 'fluent' },
    })

    expect(report.verdict).toBe('fail')
    expect(report.layers.hard.passed).toBe(false)
    expect(report.layers.model.considered).toBe(false)
    expect(report.layers.model.overrodeHardAssertions).toBe(false)
    expect(report.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'permission.denied-must-block', layer: 'hard' }),
      ]),
    )
  })

  it('repeats to a comparable report when the same catalog and observations are reused', () => {
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
          latencyMs: 640,
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
    expect(first.layers.model.considered).toBe(true)
  })
})
