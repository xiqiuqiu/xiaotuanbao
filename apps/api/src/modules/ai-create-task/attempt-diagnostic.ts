import { Prisma, type AiUsageSource } from '@prisma/client'
import {
  attemptDiagnosticPersist,
  attemptRecoveryJudgment,
  type HeadlessExecutionResult,
} from '@xiaotuanbao/ai-contracts'

export function attemptDiagnosticUpdate(result?: HeadlessExecutionResult): {
  mastraTraceId: string | null
  usageSource: AiUsageSource
  usage: Prisma.InputJsonValue | typeof Prisma.DbNull
  latencyMs: number | null
  errorCode?: string
  toolSteps: Prisma.InputJsonValue
} {
  if (!result) {
    return {
      mastraTraceId: null,
      usageSource: 'missing',
      usage: Prisma.DbNull,
      latencyMs: null,
      toolSteps: [],
    }
  }
  const record = attemptDiagnosticPersist(result)
  return {
    mastraTraceId: record.mastraTraceId,
    usageSource: record.usageSource,
    usage: record.usage ?? Prisma.DbNull,
    latencyMs: record.latencyMs,
    ...(record.errorCode ? { errorCode: record.errorCode } : {}),
    toolSteps: record.toolSteps as Prisma.InputJsonValue,
  }
}

export function manifestUsageUpdate(result?: HeadlessExecutionResult): {
  processorVersion?: string
  usageSource: AiUsageSource
  usage: Prisma.InputJsonValue | typeof Prisma.DbNull
  stepUsages: Prisma.InputJsonValue
} {
  if (!result) {
    return {
      usageSource: 'missing',
      usage: Prisma.DbNull,
      stepUsages: [],
    }
  }
  const record = attemptDiagnosticPersist(result)
  return {
    ...(record.processorVersion ? { processorVersion: record.processorVersion } : {}),
    usageSource: record.usageSource,
    usage: record.usage ?? Prisma.DbNull,
    stepUsages: record.modelSteps as Prisma.InputJsonValue,
  }
}

export function recoveryFromAttempt(attempt: {
  status: 'running' | 'completed' | 'failed'
  errorCode: string | null
  resultJson: unknown
  mastraTraceId: string | null
}) {
  const resultKind =
    attempt.resultJson &&
    typeof attempt.resultJson === 'object' &&
    'kind' in attempt.resultJson &&
    (attempt.resultJson.kind === 'completed' ||
      attempt.resultJson.kind === 'failed' ||
      attempt.resultJson.kind === 'awaiting_review' ||
      attempt.resultJson.kind === 'awaiting_user_input' ||
      attempt.resultJson.kind === 'registered_intent')
      ? attempt.resultJson.kind
      : null
  return attemptRecoveryJudgment({
    status: attempt.status,
    errorCode: attempt.errorCode,
    resultKind,
    mastraTraceId: attempt.mastraTraceId,
  })
}
