import {
  AI_CREATE_CAPABILITY_DEFINITIONS,
  CONVERSATION_GENERAL_CAPABILITY_DEFINITIONS,
  submitReviewPackageModelInputSchema,
  type HeadlessDiagnostic,
  type HeadlessExecutionRequest,
  type ToolStepDiagnostic,
} from '@xiaotuanbao/ai-contracts'
import type { HeadlessExecutor } from './headless-execution'
import { mapModelError } from './map-agent-error'

const FALLBACK_USER_TEXT = '请根据 getTaskContext 处理当前输入批次。'

export interface MastraGenerateLike {
  text?: string
  toolCalls?: unknown[]
}

export interface MastraHeadlessExecutorDeps {
  readUserText: (request: HeadlessExecutionRequest) => Promise<string>
  generate: (userText: string) => Promise<MastraGenerateLike>
}

export function createMastraHeadlessExecutor(deps: MastraHeadlessExecutorDeps): HeadlessExecutor {
  return async (request) => {
    try {
      const userText = (await deps.readUserText(request)).trim() || FALLBACK_USER_TEXT
      const output = await deps.generate(userText)
      const diagnostic = diagnosticFromGenerate(output.toolCalls)
      const reviewPackage = reviewPackageFromToolCalls(output.toolCalls)
      if (reviewPackage) {
        return { kind: 'awaiting_review', reviewPackage, diagnostic }
      }
      const message = output.text?.trim() || '已处理当前说明。'
      return { kind: 'completed', message, diagnostic }
    } catch (error) {
      const mapped = mapModelError(error)
      return {
        kind: 'failed',
        error: mapped.toJSON(),
        diagnostic: {
          usageSource: 'missing',
          errorCode: mapped.code,
          toolSteps: [],
        },
      }
    }
  }
}

function diagnosticFromGenerate(toolCalls: unknown[] | undefined): HeadlessDiagnostic {
  return {
    usageSource: 'missing',
    toolSteps: toolStepsFromCalls(toolCalls),
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
  return [...AI_CREATE_CAPABILITY_DEFINITIONS, ...CONVERSATION_GENERAL_CAPABILITY_DEFINITIONS].find(
    (definition) => definition.toolName === toolName,
  )
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

function reviewPackageFromToolCalls(toolCalls: unknown[] | undefined) {
  if (!toolCalls) {
    return null
  }
  for (const call of toolCalls) {
    if (!call || typeof call !== 'object') {
      continue
    }
    const candidate = call as { toolName?: unknown; payload?: { toolName?: unknown; args?: unknown }; args?: unknown }
    const toolName =
      typeof candidate.toolName === 'string'
        ? candidate.toolName
        : typeof candidate.payload?.toolName === 'string'
          ? candidate.payload.toolName
          : null
    if (toolName !== 'submitReviewPackage') {
      continue
    }
    const args = candidate.args ?? candidate.payload?.args
    const parsed = submitReviewPackageModelInputSchema.safeParse(args)
    if (parsed.success) {
      return parsed.data
    }
  }
  return null
}
