import {
  firstBatchEvalCatalog,
  type EvalLayer,
  type EvalObservation,
  type EvalScenario,
  type FirstBatchEvalScenarioId,
  type HardAssertionKind,
} from './catalog'

export interface HardAssertionResult {
  id: string
  passed: boolean
  kind: HardAssertionKind
}

export interface GoldenResult {
  caseId: string
  passed: boolean
}

export interface ModelScore {
  judgeVersion: string
  score: number
  notes?: string
}

export interface OfflineEvalInput {
  catalog: readonly EvalScenario[]
  observations: Record<FirstBatchEvalScenarioId, EvalObservation>
  hardAssertions: readonly HardAssertionResult[]
  golden: GoldenResult
  modelScore: ModelScore
}

export interface EvalFailure {
  id: string
  layer: EvalLayer
}

export interface OfflineEvalReport {
  catalogVersion: 1
  verdict: 'pass' | 'fail'
  layers: {
    hard: { passed: boolean; sampleSize: number }
    deterministic: { passed: boolean; sampleSize: number }
    golden: { passed: boolean; sampleSize: number }
    model: { considered: boolean; overrodeHardAssertions: false; score: number }
  }
  failures: EvalFailure[]
}

export function runOfflineEval(input: OfflineEvalInput): OfflineEvalReport {
  const failures: EvalFailure[] = []

  for (const assertion of input.hardAssertions) {
    if (!assertion.passed) {
      failures.push({ id: assertion.id, layer: 'hard' })
    }
  }

  for (const scenario of input.catalog) {
    const observation = input.observations[scenario.id as FirstBatchEvalScenarioId]
    if (!observation || !scenarioMatches(scenario, observation)) {
      failures.push({ id: scenario.id, layer: scenario.layer })
    }
  }

  if (!input.golden.passed) {
    failures.push({ id: input.golden.caseId, layer: 'golden' })
  }

  const hardFailed = failures.some((item) => item.layer === 'hard')
  const deterministicFailed = failures.some((item) => item.layer === 'deterministic')
  const goldenFailed = failures.some((item) => item.layer === 'golden')

  return {
    catalogVersion: 1,
    verdict: failures.length === 0 ? 'pass' : 'fail',
    layers: {
      hard: { passed: !hardFailed, sampleSize: input.hardAssertions.length },
      deterministic: {
        passed: !deterministicFailed,
        sampleSize: input.catalog.filter((scenario) => scenario.layer === 'deterministic').length,
      },
      golden: { passed: !goldenFailed, sampleSize: 1 },
      model: {
        considered: !hardFailed,
        overrodeHardAssertions: false,
        score: input.modelScore.score,
      },
    },
    failures,
  }
}

export function compareEvalReports(
  left: OfflineEvalReport,
  right: OfflineEvalReport,
): { equal: boolean; diffs: string[] } {
  const diffs: string[] = []
  if (left.verdict !== right.verdict) {
    diffs.push(`verdict:${left.verdict}->${right.verdict}`)
  }
  if (left.catalogVersion !== right.catalogVersion) {
    diffs.push(`catalogVersion:${left.catalogVersion}->${right.catalogVersion}`)
  }
  if (JSON.stringify(left.layers) !== JSON.stringify(right.layers)) {
    diffs.push('layers')
  }
  if (JSON.stringify(left.failures) !== JSON.stringify(right.failures)) {
    diffs.push('failures')
  }
  return { equal: diffs.length === 0, diffs }
}

function scenarioMatches(scenario: EvalScenario, observation: EvalObservation): boolean {
  switch (scenario.id) {
    case 'intent.taskless.plaintext': {
      const expected = scenario.expect.selectedAgent as { key: string; version: number }
      return (
        observation.selectedAgent?.key === expected.key &&
        observation.selectedAgent.version === expected.version
      )
    }
    case 'tool.departure.get-task-context': {
      const expected = scenario.expect.selectedTools as readonly string[]
      return arraysEqual(observation.selectedTools ?? [], expected)
    }
    case 'schema.review-package.valid':
      return observation.schemaValid === true
    case 'token.usage-source.missing-estimated-actual': {
      const expected = scenario.expect.usageSources as readonly string[]
      return arraysEqual(observation.usageSources ?? [], expected)
    }
    case 'latency.within-budget': {
      const max = scenario.expect.maxLatencyMs as number
      return typeof observation.latencyMs === 'number' && observation.latencyMs <= max
    }
    case 'golden.language.clarity':
      return true
    case 'model.explanation.clarity': {
      const min = scenario.expect.minScore as number
      return typeof observation.modelScore === 'number' && observation.modelScore >= min
    }
    default:
      return false
  }
}

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

export { firstBatchEvalCatalog }
