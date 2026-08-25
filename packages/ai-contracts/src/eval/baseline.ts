import { CONVERSATION_GENERAL_AGENT_DEFINITION_REF } from '../runtime/conversation-general-definitions'
import { firstBatchEvalCatalog } from './catalog'
import { runOfflineEval, type OfflineEvalInput, type OfflineEvalReport } from './runner'

export const OFFLINE_EVAL_BASELINE_INPUT: OfflineEvalInput = {
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
      latencyMs: 640,
    },
    'golden.language.clarity': {},
    'model.explanation.clarity': { modelScore: 0.82 },
  },
  hardAssertions: [
    { id: 'permission.denied-must-block', passed: true, kind: 'permission' },
    { id: 'amount.must-match-domain', passed: true, kind: 'amount' },
    { id: 'idempotency.no-second-effect', passed: true, kind: 'idempotency' },
    { id: 'object-version.must-cas', passed: true, kind: 'object_version' },
    { id: 'business-effect.must-commit', passed: true, kind: 'business_effect' },
  ],
  golden: { caseId: 'golden.language.clarity', passed: true },
  modelScore: { judgeVersion: 'eval-judge@1', score: 0.82, notes: 'clear enough' },
}

export function runOfflineEvalBaseline(): OfflineEvalReport {
  return runOfflineEval(OFFLINE_EVAL_BASELINE_INPUT)
}
