import { workItemsInputSchema, preservesWorkItems, type RecordedWorkItem } from './work-items.tool'
import {
  AI_CREATE_CAPABILITY_DEFINITIONS,
  CONVERSATION_GENERAL_CAPABILITY_DEFINITIONS,
  DEPARTURE_COLLABORATION_CAPABILITY_DEFINITIONS,
  AiCollaborationError,
  CONVERSATION_ROUTING_TOOL,
  conversationRoutingOutputSchema,
  registeredTaskDescriptors,
  submitReviewPackageModelInputSchema,
  submitSegmentResourceReviewModelInputSchema,
  submitDepartureResourceReviewModelInputSchema,
  submitSourceOrderReviewPackageModelInputSchema,
  uniqueCapabilityDefinitions,
  createThinkTagSplitter,
  PUBLIC_REPLY_FALLBACK,
  selectPublicReply,
  validateHeadlessOutcomeAgainstGoal,
  type HeadlessResolvedItemsResult,
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
    const startedAt = Date.now()
    yield { type: 'run.started' }
    try {
      const userText = (await deps.readUserText(request)).trim() || FALLBACK_USER_TEXT
      const streamed = deps.stream ? await deps.stream(userText, options?.signal) : null
      let sequence = 1
      let stepReasoning = ''
      let stepPublicText = ''
      let stepHasTools = false
      let streamedPublicText = ''
      const streamedReasoning: string[] = []
      const thinkTags = createThinkTagSplitter()
      const streamedToolResults: unknown[] = []
      const stepLatencies: number[] = []
      let stepStartedAt: number | undefined

      const consumeThinkParts = function* (
        parts: Array<{ channel: 'public' | 'reasoning'; text: string }>,
      ): Generator<HeadlessRunFrame> {
        for (const part of parts) {
          if (part.channel === 'reasoning') {
            stepReasoning += part.text
            yield { type: 'reasoning.delta', sequence, text: stepReasoning }
            sequence += 1
            continue
          }
          stepPublicText += part.text
        }
      }

      const commitModelStep = () => {
        if (stepReasoning) {
          streamedReasoning.push(stepReasoning)
        }
        if (!stepHasTools) {
          streamedPublicText += stepPublicText
        }
        stepReasoning = ''
        stepPublicText = ''
        stepHasTools = false
      }

      if (streamed?.fullStream) {
        for await (const chunk of iterateUnknownStream(streamed.fullStream)) {
          if (chunk && typeof chunk === 'object' && 'type' in chunk) {
            if (chunk.type === 'step-start') stepStartedAt = Date.now()
            if (chunk.type === 'step-finish' && stepStartedAt != null) {
              stepLatencies.push(Date.now() - stepStartedAt)
              stepStartedAt = undefined
            }
          }
          if (chunk && typeof chunk === 'object' && 'type' in chunk && chunk.type === 'tool-error') {
            const { toolCallId, toolName } = toolPayload(chunk)
            streamedToolResults.push({ toolCallId, toolName, isError: true })
          }
          if (chunk && typeof chunk === 'object' && 'type' in chunk && chunk.type === 'tool-result') {
            streamedToolResults.push(chunk)
          }
          if (isToolActivityChunk(chunk)) {
            stepHasTools = true
          }
          if (isStepBoundaryChunk(chunk)) {
            yield* consumeThinkParts(thinkTags.flush())
            commitModelStep()
            continue
          }
          const reasoning = reasoningTextFromChunk(chunk)
          if (reasoning) {
            if (stepHasTools) {
              yield* consumeThinkParts(thinkTags.flush())
              commitModelStep()
            }
            stepReasoning += reasoning
            yield { type: 'reasoning.delta', sequence, text: stepReasoning }
            sequence += 1
            continue
          }
          const text = publicTextFromChunk(chunk)
          if (!text) {
            continue
          }
          if (stepHasTools) {
            yield* consumeThinkParts(thinkTags.flush())
            commitModelStep()
          }
          yield* consumeThinkParts(thinkTags.push(text))
        }
      }
      yield* consumeThinkParts(thinkTags.flush())
      commitModelStep()
      const output = streamed ? await outputFromStream(streamed) : await requireGenerate(deps)(userText)
      const result = validateHeadlessOutcomeAgainstGoal({
        executionGoal: request.executionGoal,
        pendingItems: request.pendingItems,
        currentUserText: request.currentUserText,
        outcome: resultFromGenerate(
          { ...output, toolResults: [...streamedToolResults, ...(output.toolResults ?? [])] },
          {
            streamedPublicText,
            streamedReasoning,
            request,
            allowFullOutputFallback: streamed?.fullStream == null,
          },
        ),
      })
      if (
        (result.kind === 'answered' || result.kind === 'registered_intent' || result.kind === 'resolved_items') &&
        result.message
      ) {
        yield { type: 'message.delta', sequence, text: result.message }
        sequence += 1
      }
      if (result.diagnostic) {
        result.diagnostic.latencyMs = Date.now() - startedAt
        result.diagnostic.modelSteps = result.diagnostic.modelSteps.map((step) => ({
          ...step,
          ...(stepLatencies[step.stepIndex] != null ? { latencyMs: stepLatencies[step.stepIndex] } : {}),
        }))
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

function resultFromGenerate(
  output: MastraGenerateLike,
  publicReply: {
    streamedPublicText: string
    streamedReasoning: readonly string[]
    allowFullOutputFallback?: boolean
    request?: HeadlessExecutionRequest
  } = {
    streamedPublicText: '',
    streamedReasoning: [],
  },
): HeadlessExecutionResult {
  const toolSteps = toolStepsFromCalls(output.toolCalls, output.toolResults)
  const diagnostic = diagnosticFromMastraGenerate(output, toolSteps)
  if (isCapacityTripwire(output)) {
    return capacityFailure(diagnostic)
  }
  if (publicReply.request?.executionGoal === 'resolve_items') {
    return resolvedItemsFromGenerate(output, publicReply.request, diagnostic)
  }
  const reviewPackages = acceptedReviewPackagesFromGenerate(output)
  if (reviewPackages.length > 0) {
    return {
      kind: 'awaiting_review',
      reviewPackage: reviewPackages[0]!,
      reviewPackages,
      completionBasis: { kind: 'accepted_review_package' },
      diagnostic,
    }
  }
  const rejectedReview = [
    'proposeReviewPackage',
    'proposeSourceOrderReviewPackage',
    'proposeSegmentResourceReviewPackage',
    'proposeDepartureResourceReviewPackage',
  ].some((name) => {
    const result = lastToolResult(output.toolResults, name)
    return result && typeof result === 'object' && 'status' in result && result.status === 'rejected'
  })
  if (rejectedReview) {
    return { kind: 'failed', error: new AiCollaborationError('INVALID_FORMAT', '审核建议未能生成，资料引用或字段校验未通过，请重试整理。').toJSON(), diagnostic }
  }
  const message = selectPublicReply({
    streamedPublicText: publicReply.streamedPublicText,
    streamedReasoning: publicReply.streamedReasoning,
    fullOutputText: publicReply.allowFullOutputFallback === false ? '' : output.text ?? '',
    fallback: '',
  })
  const routing = acceptedConversationRoutingFromGenerate(output)
  if (
    routing &&
    'registeredIntent' in routing &&
    registeredTaskDescriptors.findByRoutingDecision(routing.decision)
  ) {
    return {
      kind: 'registered_intent',
      intent: routing.registeredIntent,
      message: message || PUBLIC_REPLY_FALLBACK,
      completionBasis: { kind: 'governed_action_result' },
      diagnostic,
    }
  }
  if (routing && 'interaction' in routing) {
    return {
      kind: 'awaiting_user_input',
      interaction: routing.interaction,
      completionBasis: { kind: 'persistent_clarification' },
      diagnostic,
    }
  }
  if (!message.trim()) {
    return {
      kind: 'failed',
      error: AiCollaborationError.fromCode('AGENT_OUTCOME_INCOMPLETE').toJSON(),
      diagnostic,
    }
  }
  return {
    kind: 'answered',
    message,
    completionBasis: { kind: 'final_answer' },
    diagnostic,
  }
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
  return deltaTextFromChunk(chunk, 'text-delta')
}

function reasoningTextFromChunk(chunk: unknown): string | null {
  return deltaTextFromChunk(chunk, 'reasoning-delta')
}

function isToolActivityChunk(chunk: unknown): boolean {
  if (!chunk || typeof chunk !== 'object') {
    return false
  }
  const type = (chunk as { type?: unknown }).type
  return (
    type === 'tool-call' ||
    type === 'tool-call-delta' ||
    type === 'tool-result' ||
    type === 'tool-error' ||
    type === 'tool-input-start' ||
    type === 'tool-input-delta' ||
    type === 'tool-input-end' ||
    type === 'tool-call-input-streaming-start' ||
    type === 'tool-call-input-streaming-end'
  )
}

function isStepBoundaryChunk(chunk: unknown): boolean {
  if (!chunk || typeof chunk !== 'object') {
    return false
  }
  const type = (chunk as { type?: unknown }).type
  return type === 'step-start' || type === 'step-finish'
}

function deltaTextFromChunk(chunk: unknown, expectedType: string): string | null {
  if (!chunk || typeof chunk !== 'object') {
    return null
  }
  const type = (chunk as { type?: unknown }).type
  if (type !== expectedType) {
    return null
  }
  const record = chunk as {
    textDelta?: unknown
    text?: unknown
    delta?: unknown
    payload?: { text?: unknown; delta?: unknown }
  }
  if (typeof record.payload?.text === 'string' && record.payload.text.length > 0) {
    return record.payload.text
  }
  if (typeof record.payload?.delta === 'string' && record.payload.delta.length > 0) {
    return record.payload.delta
  }
  if (typeof record.delta === 'string' && record.delta.length > 0) {
    return record.delta
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

function toolStepsFromCalls(toolCalls: unknown[] | undefined, toolResults: unknown[] | undefined): ToolStepDiagnostic[] {
  if (!toolCalls) {
    return []
  }
  return toolCalls.flatMap((call, index) => {
    const toolName = toolNameFromCall(call)
    if (!toolName) {
      return []
    }
    const callPayload = toolPayload(call)
    const result = callPayload.toolCallId
      ? toolResults?.map(toolPayload).find((item) => item.toolCallId === callPayload.toolCallId)
      : toolResults?.map(toolPayload).filter((item) => item.toolName === toolName)[
          toolCalls.slice(0, index).filter((item) => toolNameFromCall(item) === toolName).length
        ]
    const capability = capabilityForToolName(toolName)
    return [
      {
        stepId: `tool-${index + 1}`,
        ...(callPayload.toolCallId ? { toolCallId: callPayload.toolCallId } : {}),
        toolName,
        ...(capability
          ? { capabilityKey: capability.key, capabilityVersion: capability.version }
          : {}),
        status:
          !result || result.isError === true || result.error != null
            ? 'failed' as const
            : 'succeeded' as const,
      },
    ]
  })
}

function toolPayload(value: unknown): { toolCallId?: string; toolName?: string; isError?: boolean; error?: unknown; result?: unknown } {
  if (!value || typeof value !== 'object') return {}
  const item = value as { payload?: object }
  return item.payload ?? value
}

function capabilityForToolName(toolName: string) {
  return uniqueCapabilityDefinitions([
    ...AI_CREATE_CAPABILITY_DEFINITIONS,
    ...CONVERSATION_GENERAL_CAPABILITY_DEFINITIONS,
    ...DEPARTURE_COLLABORATION_CAPABILITY_DEFINITIONS,
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

function acceptedReviewPackagesFromGenerate(output: MastraGenerateLike) {
  const packages: Extract<HeadlessExecutionResult, { kind: 'awaiting_review' }>['reviewPackage'][] = []
  const seenCalls = new Set<string>()
  for (const item of output.toolResults ?? []) {
    const { toolName, toolCallId, result } = toolPayload(item)
    if (!['proposeReviewPackage', 'proposeSegmentResourceReviewPackage', 'proposeDepartureResourceReviewPackage', 'proposeSourceOrderReviewPackage'].includes(toolName ?? '')) continue
    if (!result || typeof result !== 'object' || !('status' in result) || result.status !== 'accepted') continue
    if (toolCallId && seenCalls.has(toolCallId)) continue
    const schema = toolName === 'proposeReviewPackage'
      ? submitReviewPackageModelInputSchema
      : toolName === 'proposeSegmentResourceReviewPackage'
        ? submitSegmentResourceReviewModelInputSchema
        : toolName === 'proposeDepartureResourceReviewPackage'
          ? submitDepartureResourceReviewModelInputSchema
        : submitSourceOrderReviewPackageModelInputSchema
    const parsed = schema.safeParse(result)
    if (!parsed.success) continue
    if (toolCallId) seenCalls.add(toolCallId)
    packages.push(parsed.data)
  }
  return packages
}

function acceptedConversationRoutingFromGenerate(output: MastraGenerateLike) {
  const result = lastToolResult(output.toolResults, CONVERSATION_ROUTING_TOOL.name)
  const parsed = conversationRoutingOutputSchema.safeParse(result)
  return parsed.success ? parsed.data : null
}

function lastToolResult(toolResults: unknown[] | undefined, expectedToolName: string): unknown {
  if (!toolResults) {
    return null
  }
  let last: unknown = null
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
    if (toolName === expectedToolName) {
      last = candidate.result ?? candidate.payload?.result ?? null
    }
  }
  return last
}

function resolvedItemsFromGenerate(
  output: MastraGenerateLike,
  request: HeadlessExecutionRequest,
  diagnostic: ReturnType<typeof diagnosticFromMastraGenerate>,
): HeadlessExecutionResult {
  const fail = (): HeadlessExecutionResult => ({ kind: 'failed', error: AiCollaborationError.fromCode('AGENT_OUTCOME_INCOMPLETE').toJSON(), diagnostic })
  let items: RecordedWorkItem[] = (request.pendingItems ?? []).map(item => ({ ...item, resolution: { kind: 'pending' } }))
  const seenCalls = new Set<string>()
  const routing: ReturnType<typeof conversationRoutingOutputSchema.parse>[] = []
  for (const raw of output.toolResults ?? []) {
    const { toolName, toolCallId, result } = toolPayload(raw)
    if (toolCallId && seenCalls.has(toolCallId)) continue
    if (toolCallId) seenCalls.add(toolCallId)
    if (toolName === CONVERSATION_ROUTING_TOOL.name) {
      const parsed = conversationRoutingOutputSchema.safeParse(result)
      if (parsed.success) routing.push(parsed.data)
    }
    if (toolName !== 'recordWorkItems' || !result || typeof result !== 'object' || !('status' in result) || result.status !== 'accepted') continue
    const parsed = workItemsInputSchema.safeParse(result)
    if (!parsed.success || !preservesWorkItems(items, parsed.data.items)) return fail()
    items = parsed.data.items
  }
  if (items.length === 0) return fail()
  const resolved: HeadlessResolvedItemsResult['items'] = []
  const usedRouting = new Set<number>()
  for (const item of items) {
    const resolution = item.resolution
    if (resolution.kind === 'pending') return fail()
    if (resolution.kind === 'withdrawn' && !request.currentUserText?.includes(resolution.userExcerpt)) return fail()
    if (resolution.kind === 'awaiting_user_input' || resolution.kind === 'registered_intent') {
      if (usedRouting.has(resolution.routingIndex)) return fail()
      usedRouting.add(resolution.routingIndex)
      const actual = routing[resolution.routingIndex]
      if (resolution.kind === 'awaiting_user_input') {
        if (!actual || !('interaction' in actual)) return fail()
        resolved.push({ ...item, resolution: { kind: 'awaiting_user_input', interaction: actual.interaction } })
      } else {
        if (!actual || !('registeredIntent' in actual)) return fail()
        resolved.push({ ...item, resolution: { kind: 'registered_intent', intent: actual.registeredIntent } })
      }
    } else resolved.push({ ...item, resolution })
  }
  const messages = resolved.flatMap(item => {
    switch (item.resolution.kind) {
      case 'answered': return [item.resolution.message]
      case 'awaiting_user_input': return [item.resolution.interaction.prompt]
      case 'awaiting_review': return [`${item.request}：已生成待审核建议。`]
      case 'registered_intent': return [`${item.request}：已登记任务目标，等待确认。`]
      case 'withdrawn': return [`${item.request}：已按你的要求撤销。`]
    }
  })
  return {
    kind: 'resolved_items', message: messages.join('\n\n'), items: resolved,
    reviewPackages: acceptedReviewPackagesFromGenerate(output),
    completionBasis: { kind: 'resolved_items' }, diagnostic,
  }
}
