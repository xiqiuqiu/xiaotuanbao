import {
  submitReviewPackageModelInputSchema,
  type HeadlessExecutionRequest,
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
      const reviewPackage = reviewPackageFromToolCalls(output.toolCalls)
      if (reviewPackage) {
        return { kind: 'awaiting_review', reviewPackage }
      }
      const message = output.text?.trim() || '已处理当前说明。'
      return { kind: 'completed', message }
    } catch (error) {
      return {
        kind: 'failed',
        error: mapModelError(error).toJSON(),
      }
    }
  }
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
