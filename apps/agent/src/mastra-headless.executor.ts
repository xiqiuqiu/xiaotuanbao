import {
  AI_CREATE_CAPABILITY_DEFINITIONS,
  CONVERSATION_GENERAL_CAPABILITY_DEFINITIONS,
  AiCollaborationError,
  submitReviewPackageModelInputSchema,
  uniqueCapabilityDefinitions,
  type HeadlessExecutionRequest,
  type HeadlessExecutionResult,
  type HeadlessRunFrame,
  type ToolStepDiagnostic,
} from '@xiaotuanbao/ai-contracts'
import type { HeadlessExecutor } from './headless-execution'
import { mapModelError } from './map-agent-error'
import {
  diagnosticFromMastraGenerate,
  isCapacityTripwire,
  type MastraGenerateLike,
} from './provider-usage'

const FALLBACK_USER_TEXT = '请根据 getTaskContext 处理当前输入批次。'

export type { MastraGenerateLike }

export interface MastraStreamLike {
  fullStream?: AsyncIterable<unknown> | ReadableStream<unknown>
  getFullOutput?: () => Promise<MastraGenerateLike>
  text?: Promise<string> | string
  toolCalls?: unknown[] | Promise<unknown[]>
  toolResults?: unknown[] | Promise<unknown[]>
  usage?: unknown
  totalUsage?: unknown
  steps?: unknown[] | Promise<unknown[]>
  traceId?: string
  runId?: string
  tripwire?: MastraGenerateLike['tripwire']
}

export interface MastraHeadlessExecutorDeps {
  readUserText: (request: HeadlessExecutionRequest) => Promise<string>
  generate?: (userText: string) => Promise<MastraGenerateLike>
  stream?: (
    userText: string,
    signal?: AbortSignal,
  ) => Promise<MastraStreamLike> | MastraStreamLike
}

export function createMastraHeadlessExecutor(deps: MastraHeadlessExecutorDeps): HeadlessExecutor {
  return async function* streamMastraRun(
    request: HeadlessExecutionRequest,
    options?: { signal?: AbortSignal },
  ): AsyncIterable<HeadlessRunFrame> {
    yield { type: 'run.started' }
    try {
      const userText = (await deps.readUserText(request)).trim() || FALLBACK_USER_TEXT
      const streamed = deps.stream ? await deps.stream(userText, options?.signal) : null
      let sequence = 1
      if (streamed?.fullStream) {
        for await (const chunk of iterateUnknownStream(streamed.fullStream)) {
          const text = publicTextFromChunk(chunk)
          if (!text) {
            continue
          }
          yield { type: 'message.delta', sequence, text }
          sequence += 1
        }
      }
      const output = streamed ? await outputFromStream(streamed) : await requireGenerate(deps)(userText)
      const result = resultFromGenerate(output)
      if (result.kind === 'completed' && sequence === 1) {
        yield { type: 'message.delta', sequence: 1, text: result.message }
      }
      yield { type: 'run.completed', result }
    } catch (error) {
      const mapped = mapModelError(error)
      yield {
        type: 'run.completed',
        result: {
          kind: 'failed',
          error: mapped.toJSON(),
          diagnostic: {
            ...diagnosticFromMastraGenerate({}, []),
            errorCode: mapped.code,
          },
        },
      }
    }
  }
}

function requireGenerate(deps: MastraHeadlessExecutorDeps): (userText: string) => Promise<MastraGenerateLike> {
  if (!deps.generate) {
    throw new Error('mastra headless executor requires generate or stream')
  }
  return deps.generate
}

function resultFromGenerate(output: MastraGenerateLike): HeadlessExecutionResult {
  const toolSteps = toolStepsFromCalls(output.toolCalls)
  const diagnostic = diagnosticFromMastraGenerate(output, toolSteps)
  if (isCapacityTripwire(output)) {
    return capacityFailure(diagnostic)
  }
  const reviewPackage = acceptedReviewPackageFromGenerate(output)
  if (reviewPackage) {
    return { kind: 'awaiting_review', reviewPackage, diagnostic }
  }
  const message = output.text?.trim() || '已处理当前说明。'
  return { kind: 'completed', message, diagnostic }
}

async function outputFromStream(streamed: MastraStreamLike): Promise<MastraGenerateLike> {
  if (streamed.getFullOutput) {
    return streamed.getFullOutput()
  }
  return {
    text: await maybePromise(streamed.text),
    toolCalls: await maybePromise(streamed.toolCalls),
    toolResults: await maybePromise(streamed.toolResults),
    usage: streamed.usage,
    totalUsage: streamed.totalUsage,
    steps: await maybePromise(streamed.steps),
    traceId: streamed.traceId,
    runId: streamed.runId,
    tripwire: streamed.tripwire,
  }
}

async function maybePromise<T>(value: T | Promise<T> | undefined): Promise<T | undefined> {
  return value
}

function publicTextFromChunk(chunk: unknown): string | null {
  if (!chunk || typeof chunk !== 'object') {
    return null
  }
  const type = (chunk as { type?: unknown }).type
  if (type !== 'text-delta') {
    return null
  }
  const record = chunk as {
    textDelta?: unknown
    text?: unknown
    payload?: { text?: unknown }
  }
  if (typeof record.payload?.text === 'string' && record.payload.text.length > 0) {
    return record.payload.text
  }
  if (typeof record.textDelta === 'string' && record.textDelta.length > 0) {
    return record.textDelta
  }
  if (typeof record.text === 'string' && record.text.length > 0) {
    return record.text
  }
  return null
}

async function* iterateUnknownStream(stream: AsyncIterable<unknown> | ReadableStream<unknown>): AsyncIterable<unknown> {
  if (Symbol.asyncIterator in stream) {
    yield* stream as AsyncIterable<unknown>
    return
  }
  const reader = (stream as ReadableStream<unknown>).getReader()
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }
      yield value
    }
  } finally {
    reader.releaseLock()
  }
}

function capacityFailure(diagnostic: ReturnType<typeof diagnosticFromMastraGenerate>) {
  const error = AiCollaborationError.fromCode('CONTEXT_CAPACITY_EXCEEDED')
  return {
    kind: 'failed' as const,
    error: error.toJSON(),
    diagnostic: {
      ...diagnostic,
      errorCode: error.code,
    },
  }
}

function toolStepsFromCalls(toolCalls: unknown[] | undefined): ToolStepDiagnostic[] {
  if (!toolCalls) {
    return []
  }
  return toolCalls.flatMap((call, index) => {
    const toolName = toolNameFromCall(call)
    if (!toolName) {
      return []
    }
    const capability = capabilityForToolName(toolName)
    return [
      {
        stepId: `tool-${index + 1}`,
        toolName,
        ...(capability
          ? { capabilityKey: capability.key, capabilityVersion: capability.version }
          : {}),
        status: 'succeeded' as const,
      },
    ]
  })
}

function capabilityForToolName(toolName: string) {
  return uniqueCapabilityDefinitions([
    ...AI_CREATE_CAPABILITY_DEFINITIONS,
    ...CONVERSATION_GENERAL_CAPABILITY_DEFINITIONS,
  ]).find((definition) => definition.toolName === toolName)
}

function toolNameFromCall(call: unknown): string | null {
  if (!call || typeof call !== 'object') {
    return null
  }
  const candidate = call as {
    toolName?: unknown
    payload?: { toolName?: unknown }
  }
  if (typeof candidate.toolName === 'string') {
    return candidate.toolName
  }
  if (typeof candidate.payload?.toolName === 'string') {
    return candidate.payload.toolName
  }
  return null
}

function acceptedReviewPackageFromGenerate(output: MastraGenerateLike) {
  const accepted = lastAcceptedProposeResult(output.toolResults)
  if (!accepted) {
    return null
  }
  const parsed = submitReviewPackageModelInputSchema.safeParse({
    objectVersion: accepted.objectVersion,
    confirmationUnit: accepted.confirmationUnit,
    candidates: accepted.candidates,
  })
  return parsed.success ? parsed.data : null
}

function lastAcceptedProposeResult(toolResults: unknown[] | undefined) {
  if (!toolResults) {
    return null
  }
  let last: {
    objectVersion: number
    confirmationUnit: string
    candidates: unknown
  } | null = null
  for (const item of toolResults) {
    if (!item || typeof item !== 'object') {
      continue
    }
    const candidate = item as {
      toolName?: unknown
      payload?: { toolName?: unknown; result?: unknown }
      result?: unknown
    }
    const toolName =
      typeof candidate.toolName === 'string'
        ? candidate.toolName
        : typeof candidate.payload?.toolName === 'string'
          ? candidate.payload.toolName
          : null
    if (toolName !== 'proposeReviewPackage') {
      continue
    }
    const result = candidate.result ?? candidate.payload?.result
    if (!result || typeof result !== 'object') {
      continue
    }
    const parsed = result as {
      status?: unknown
      objectVersion?: unknown
      confirmationUnit?: unknown
      candidates?: unknown
    }
    if (parsed.status !== 'accepted') {
      last = null
      continue
    }
    if (typeof parsed.objectVersion !== 'number' || typeof parsed.confirmationUnit !== 'string') {
      continue
    }
    last = {
      objectVersion: parsed.objectVersion,
      confirmationUnit: parsed.confirmationUnit,
      candidates: parsed.candidates,
    }
  }
  return last
}
