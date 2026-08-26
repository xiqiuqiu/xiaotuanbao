import {
  TOKEN_LIMITER_PROCESSOR_VERSION,
  aggregateUsageCounts,
  resolveDiagnosticUsage,
  usageCountsFromProvider,
  type HeadlessDiagnostic,
  type ModelStepUsage,
  type ToolStepDiagnostic,
} from '@xiaotuanbao/ai-contracts'

export interface MastraGenerateLike {
  text?: string
  toolCalls?: unknown[]
  toolResults?: unknown[]
  usage?: unknown
  totalUsage?: unknown
  steps?: unknown[]
  traceId?: string
  runId?: string
  tripwire?: { reason?: string; processorId?: string } | null
}

export function diagnosticFromMastraGenerate(
  output: MastraGenerateLike,
  toolSteps: ToolStepDiagnostic[],
): HeadlessDiagnostic {
  const modelSteps = modelStepsFromGenerate(output.steps)
  const provider =
    usageCountsFromProvider(output.totalUsage) ??
    usageCountsFromProvider(output.usage) ??
    aggregateUsageCounts(modelSteps.map((step) => step.usage))
  const resolved = resolveDiagnosticUsage({ provider })
  const traceId = output.traceId ?? output.runId
  return {
    ...(traceId ? { mastraTraceId: String(traceId) } : {}),
    processorVersion: TOKEN_LIMITER_PROCESSOR_VERSION,
    ...resolved,
    toolSteps,
    modelSteps,
  }
}

export function isCapacityTripwire(output: MastraGenerateLike): boolean {
  const tripwire = output.tripwire
  if (!tripwire) {
    return false
  }
  const reason = tripwire.reason ?? ''
  const processorId = tripwire.processorId ?? ''
  return (
    processorId.includes('token-limiter') ||
    reason.includes('TokenLimiterProcessor') ||
    reason === 'CONTEXT_CAPACITY_EXCEEDED'
  )
}

function modelStepsFromGenerate(steps: unknown[] | undefined): ModelStepUsage[] {
  if (!steps) {
    return []
  }
  return steps.map((step, index) => {
    const usage = usageCountsFromProvider(
      step && typeof step === 'object' ? (step as { usage?: unknown }).usage : undefined,
    )
    return {
      stepIndex: index,
      ...(usage ? { usageSource: 'actual' as const, usage } : { usageSource: 'missing' as const }),
    }
  })
}
