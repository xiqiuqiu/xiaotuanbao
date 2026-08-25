import { CONVERSATION_GENERAL_AGENT_DEFINITION_REF } from '../runtime/conversation-general-definitions'
import { USAGE_SOURCES, type UsageSource } from '../runtime/headless-execution'

export const EVAL_LAYERS = ['hard', 'deterministic', 'golden', 'model'] as const
export type EvalLayer = (typeof EVAL_LAYERS)[number]

export const HARD_ASSERTION_KINDS = [
  'permission',
  'amount',
  'idempotency',
  'object_version',
  'business_effect',
] as const
export type HardAssertionKind = (typeof HARD_ASSERTION_KINDS)[number]

export interface EvalScenario {
  id: string
  version: 1
  purpose: string
  layer: EvalLayer
  expect: Record<string, unknown>
}

export const firstBatchEvalCatalog = [
  {
    id: 'intent.taskless.plaintext',
    version: 1,
    purpose: '无任务普通查询路由到通用会话 Definition',
    layer: 'deterministic',
    expect: { selectedAgent: CONVERSATION_GENERAL_AGENT_DEFINITION_REF },
  },
  {
    id: 'tool.departure.get-task-context',
    version: 1,
    purpose: '建团读取任务上下文时选择 getTaskContext',
    layer: 'deterministic',
    expect: { selectedTools: ['getTaskContext'] },
  },
  {
    id: 'schema.review-package.valid',
    version: 1,
    purpose: '审核包提案必须通过结构化 Schema',
    layer: 'hard',
    expect: { schemaValid: true },
  },
  {
    id: 'token.usage-source.missing-estimated-actual',
    version: 1,
    purpose: 'provider usage 缺失、估算和实际值可区分',
    layer: 'deterministic',
    expect: { usageSources: [...USAGE_SOURCES] },
  },
  {
    id: 'latency.within-budget',
    version: 1,
    purpose: '首批场景延迟不超过 2000ms 预算',
    layer: 'deterministic',
    expect: { maxLatencyMs: 2000 },
  },
  {
    id: 'golden.language.clarity',
    version: 1,
    purpose: '人工标注的解释清晰度 golden case',
    layer: 'golden',
    expect: { goldenCaseId: 'golden.language.clarity' },
  },
  {
    id: 'model.explanation.clarity',
    version: 1,
    purpose: '经校准的模型评分只评价解释清晰度',
    layer: 'model',
    expect: { minScore: 0.7 },
  },
] as const satisfies readonly EvalScenario[]

export type FirstBatchEvalScenarioId = (typeof firstBatchEvalCatalog)[number]['id']

export interface EvalObservation {
  selectedAgent?: { key: string; version: number }
  selectedTools?: readonly string[]
  schemaValid?: boolean
  usageSources?: readonly UsageSource[]
  latencyMs?: number
  modelScore?: number
}
