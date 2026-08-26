import {
  AI_CREATE_CAPABILITY_DEFINITIONS,
  CONVERSATION_GENERAL_CAPABILITY_DEFINITIONS,
  AiCollaborationError,
  CONVERSATION_ROUTING_TOOL,
  conversationRoutingOutputSchema,
  submitReviewPackageModelInputSchema,
  uniqueCapabilityDefinitions,
  type HeadlessExecutionRequest,
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

export interface MastraHeadlessExecutorDeps {
  readUserText: (request: HeadlessExecutionRequest) => Promise<string>
  generate: (userText: string) => Promise<MastraGenerateLike>
}

export function createMastraHeadlessExecutor(deps: MastraHeadlessExecutorDeps): HeadlessExecutor {
  return async (request) => {
    try {
      const userText = (await deps.readUserText(request)).trim() || FALLBACK_USER_TEXT
      const output = await deps.generate(userText)
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
      const routing = acceptedConversationRoutingFromGenerate(output)
      if (routing?.decision === 'propose_departure_creation') {
        return {
          kind: 'registered_intent',
          intent: routing.registeredIntent,
          message,
          diagnostic,
        }
      }
      if (routing?.decision === 'request_clarification') {
        return {
          kind: 'awaiting_user_input',
          interaction: routing.interaction,
          diagnostic,
        }
      }
      return { kind: 'completed', message, diagnostic }
    } catch (error) {
      const mapped = mapModelError(error)
      return {
        kind: 'failed',
        error: mapped.toJSON(),
        diagnostic: {
          ...diagnosticFromMastraGenerate({}, []),
          errorCode: mapped.code,
        },
      }
    }
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
