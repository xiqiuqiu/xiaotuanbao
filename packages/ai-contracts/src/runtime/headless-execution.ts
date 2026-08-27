import { z } from 'zod'
import { aiCollaborationErrorSchema } from '../errors/ai-collaboration-error'
import { submitReviewPackageModelInputSchema } from '../tools/review-package'
import { registeredAgentIntentSchema } from './conversation-routing'

export const USAGE_SOURCES = ['missing', 'estimated', 'actual'] as const

export type UsageSource = (typeof USAGE_SOURCES)[number]

export const TOOL_STEP_STATUSES = [
  'succeeded',
  'failed',
  'schema_rejected',
  'denied',
] as const

export type ToolStepStatus = (typeof TOOL_STEP_STATUSES)[number]

export const usageCountsSchema = z
  .object({
    input: z.number().int().nonnegative().optional(),
    output: z.number().int().nonnegative().optional(),
    total: z.number().int().nonnegative().optional(),
  })
  .strict()
  .refine((value) => value.input != null || value.output != null || value.total != null, {
    message: 'usage must include at least one of input, output or total',
  })

export const toolStepDiagnosticSchema = z
  .object({
    stepId: z.string().min(1),
    toolName: z.string().min(1),
    capabilityKey: z.string().min(1).optional(),
    capabilityVersion: z.number().int().positive().optional(),
    status: z.enum(TOOL_STEP_STATUSES),
    latencyMs: z.number().int().nonnegative().optional(),
    errorCode: z.string().min(1).optional(),
  })
  .strict()

function refineUsageSource(
  value: { usageSource: UsageSource; usage?: UsageCounts },
  ctx: z.RefinementCtx,
  pathPrefix: Array<string | number> = [],
) {
  if (value.usageSource === 'missing' && value.usage != null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'missing usage must not invent token counts',
      path: [...pathPrefix, 'usage'],
    })
  }
  if (value.usageSource === 'actual' && value.usage == null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'actual usage requires provider token counts',
      path: [...pathPrefix, 'usage'],
    })
  }
}

export const modelStepUsageSchema = z
  .object({
    stepIndex: z.number().int().nonnegative(),
    usageSource: z.enum(USAGE_SOURCES),
    usage: usageCountsSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => refineUsageSource(value, ctx))

export const headlessDiagnosticSchema = z
  .object({
    mastraTraceId: z.string().min(1).optional(),
    processorVersion: z.string().min(1).optional(),
    usageSource: z.enum(USAGE_SOURCES),
    usage: usageCountsSchema.optional(),
    latencyMs: z.number().int().nonnegative().optional(),
    errorCode: z.string().min(1).optional(),
    toolSteps: z.array(toolStepDiagnosticSchema).default([]),
    modelSteps: z.array(modelStepUsageSchema).default([]),
  })
  .strict()
  .superRefine((value, ctx) => refineUsageSource(value, ctx))

export const HEADLESS_EXECUTION_OUTCOME_KINDS = [
  'completed',
  'registered_intent',
  'awaiting_user_input',
  'awaiting_review',
  'failed',
] as const

export type HeadlessExecutionOutcomeKind = (typeof HEADLESS_EXECUTION_OUTCOME_KINDS)[number]

export const headlessExecutionIdentitySchema = z
  .object({
    taskId: z.string().min(1).optional(),
    conversationId: z.string().min(1),
    inputBatchId: z.string().min(1),
    attemptId: z.string().min(1),
    contextManifestId: z.string().min(1),
  })
  .strip()

export const headlessExecutionRequestSchema = headlessExecutionIdentitySchema
  .extend({
    userText: z.string().trim().min(1),
    userTextSha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strip()

export const headlessCompletedResultSchema = z
  .object({
    kind: z.literal('completed'),
    message: z.string().min(1),
    diagnostic: headlessDiagnosticSchema.optional(),
  })
  .strip()

export const headlessRegisteredIntentResultSchema = z
  .object({
    kind: z.literal('registered_intent'),
    intent: registeredAgentIntentSchema,
    message: z.string().min(1),
    diagnostic: headlessDiagnosticSchema.optional(),
  })
  .strip()

export const HEADLESS_INTERACTION_TYPES = ['free_text', 'single_choice'] as const

export const headlessInteractionOptionSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
  })
  .strip()

export const headlessInteractionSchema = z
  .object({
    type: z.enum(HEADLESS_INTERACTION_TYPES),
    prompt: z.string().min(1),
    options: z.array(headlessInteractionOptionSchema).max(12).optional(),
  })
  .strip()
  .superRefine((value, ctx) => {
    if (value.type === 'single_choice' && (value.options?.length ?? 0) < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'single_choice interaction requires at least two options',
        path: ['options'],
      })
    }
    if (value.type === 'free_text' && value.options && value.options.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'free_text interaction must not include options',
        path: ['options'],
      })
    }
  })

export const headlessAwaitingUserInputResultSchema = z
  .object({
    kind: z.literal('awaiting_user_input'),
    interaction: headlessInteractionSchema,
    diagnostic: headlessDiagnosticSchema.optional(),
  })
  .strip()

export const headlessAwaitingReviewResultSchema = z
  .object({
    kind: z.literal('awaiting_review'),
    reviewPackage: submitReviewPackageModelInputSchema,
    diagnostic: headlessDiagnosticSchema.optional(),
  })
  .strip()

export const headlessFailedResultSchema = z
  .object({
    kind: z.literal('failed'),
    error: aiCollaborationErrorSchema,
    diagnostic: headlessDiagnosticSchema.optional(),
  })
  .strip()

export const headlessExecutionResultSchema = z.discriminatedUnion('kind', [
  headlessCompletedResultSchema,
  headlessRegisteredIntentResultSchema,
  headlessAwaitingUserInputResultSchema,
  headlessAwaitingReviewResultSchema,
  headlessFailedResultSchema,
])

export const headlessRunStartedFrameSchema = z
  .object({
    type: z.literal('run.started'),
  })
  .strict()

export const headlessMessageDeltaFrameSchema = z
  .object({
    type: z.literal('message.delta'),
    sequence: z.number().int().positive(),
    text: z.string().min(1),
  })
  .strict()

export const headlessReasoningDeltaFrameSchema = z
  .object({
    type: z.literal('reasoning.delta'),
    sequence: z.number().int().positive(),
    text: z.string().min(1),
  })
  .strict()

export const headlessRunHeartbeatFrameSchema = z
  .object({
    type: z.literal('run.heartbeat'),
  })
  .strict()

export const headlessRunCompletedFrameSchema = z
  .object({
    type: z.literal('run.completed'),
    result: headlessExecutionResultSchema,
  })
  .strict()

export const headlessRunFrameSchema = z.discriminatedUnion('type', [
  headlessRunStartedFrameSchema,
  headlessReasoningDeltaFrameSchema,
  headlessMessageDeltaFrameSchema,
  headlessRunHeartbeatFrameSchema,
  headlessRunCompletedFrameSchema,
])

export type HeadlessExecutionIdentity = z.infer<typeof headlessExecutionIdentitySchema>
export type HeadlessExecutionRequest = z.infer<typeof headlessExecutionRequestSchema>
export type HeadlessExecutionResult = z.infer<typeof headlessExecutionResultSchema>
export type HeadlessRunFrame = z.infer<typeof headlessRunFrameSchema>
export type HeadlessCompletedResult = z.infer<typeof headlessCompletedResultSchema>
export type HeadlessRegisteredIntentResult = z.infer<typeof headlessRegisteredIntentResultSchema>
export type HeadlessInteraction = z.infer<typeof headlessInteractionSchema>
export type HeadlessAwaitingUserInputResult = z.infer<typeof headlessAwaitingUserInputResultSchema>
export type HeadlessAwaitingReviewResult = z.infer<typeof headlessAwaitingReviewResultSchema>
export type HeadlessFailedResult = z.infer<typeof headlessFailedResultSchema>
export type UsageCounts = z.infer<typeof usageCountsSchema>
export type ToolStepDiagnostic = z.infer<typeof toolStepDiagnosticSchema>
export type ModelStepUsage = z.infer<typeof modelStepUsageSchema>
export type HeadlessDiagnostic = z.infer<typeof headlessDiagnosticSchema>

export function diagnosticFromResult(result: HeadlessExecutionResult): HeadlessDiagnostic {
  return (
    result.diagnostic ?? {
      usageSource: 'missing',
      toolSteps: [],
      modelSteps: [],
    }
  )
}

export interface AttemptDiagnosticRecord {
  mastraTraceId: string | null
  processorVersion: string | null
  usageSource: UsageSource
  usage: UsageCounts | null
  latencyMs: number | null
  errorCode: string | null
  toolSteps: ToolStepDiagnostic[]
  modelSteps: ModelStepUsage[]
}

export function attemptDiagnosticPersist(result: HeadlessExecutionResult): AttemptDiagnosticRecord {
  const diagnostic = diagnosticFromResult(result)
  return {
    mastraTraceId: diagnostic.mastraTraceId ?? null,
    processorVersion: diagnostic.processorVersion ?? null,
    usageSource: diagnostic.usageSource,
    usage: diagnostic.usage ?? null,
    latencyMs: diagnostic.latencyMs ?? null,
    errorCode:
      diagnostic.errorCode ?? (result.kind === 'failed' ? result.error.code : null),
    toolSteps: diagnostic.toolSteps ?? [],
    modelSteps: diagnostic.modelSteps ?? [],
  }
}

export function usageCountsFromProvider(value: unknown): UsageCounts | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }
  const record = value as Record<string, unknown>
  const input = nonNegativeInt(
    record.input ?? record.inputTokens ?? record.promptTokens,
  )
  const output = nonNegativeInt(
    record.output ?? record.outputTokens ?? record.completionTokens,
  )
  const total = nonNegativeInt(record.total ?? record.totalTokens)
  if (input == null && output == null && total == null) {
    return undefined
  }
  return {
    ...(input != null ? { input } : {}),
    ...(output != null ? { output } : {}),
    ...(total != null ? { total } : {}),
  }
}

export function resolveDiagnosticUsage(input: {
  provider?: unknown
  estimated?: UsageCounts
}): Pick<HeadlessDiagnostic, 'usageSource' | 'usage'> {
  const actual = usageCountsFromProvider(input.provider)
  if (actual) {
    return { usageSource: 'actual', usage: actual }
  }
  if (input.estimated) {
    return { usageSource: 'estimated', usage: input.estimated }
  }
  return { usageSource: 'missing' }
}

export function aggregateUsageCounts(values: ReadonlyArray<UsageCounts | undefined>): UsageCounts | undefined {
  let input = 0
  let output = 0
  let total = 0
  let hasInput = false
  let hasOutput = false
  let hasTotal = false
  for (const value of values) {
    if (!value) {
      continue
    }
    if (value.input != null) {
      input += value.input
      hasInput = true
    }
    if (value.output != null) {
      output += value.output
      hasOutput = true
    }
    if (value.total != null) {
      total += value.total
      hasTotal = true
    }
  }
  if (!hasInput && !hasOutput && !hasTotal) {
    return undefined
  }
  return {
    ...(hasInput ? { input } : {}),
    ...(hasOutput ? { output } : {}),
    ...(hasTotal ? { total } : {}),
  }
}

function nonNegativeInt(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined
}

export interface AttemptRecoverySnapshot {
  status: 'running' | 'completed' | 'failed'
  errorCode: string | null
  resultKind: HeadlessExecutionOutcomeKind | null
  mastraTraceId: string | null
}

export interface AttemptRecoveryJudgment {
  recoverable: boolean
  status: AttemptRecoverySnapshot['status']
  errorCode: string | null
}

export function attemptRecoveryJudgment(
  snapshot: AttemptRecoverySnapshot,
): AttemptRecoveryJudgment {
  return {
    recoverable: snapshot.status !== 'running',
    status: snapshot.status,
    errorCode: snapshot.errorCode,
  }
}
