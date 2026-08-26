import { AsyncLocalStorage } from 'node:async_hooks'
import { AiCollaborationError, type RequestContext } from '@xiaotuanbao/ai-contracts'

export interface AssistRequestContext extends Partial<RequestContext> {
  delegationToken: string
}

const storage = new AsyncLocalStorage<AssistRequestContext>()

export async function runWithAssistRequestContext<T>(
  context: AssistRequestContext,
  fn: () => T | Promise<T>,
): Promise<T> {
  return storage.run(context, async () => await fn())
}

export function getAssistRequestContext(): AssistRequestContext {
  const context = storage.getStore()
  if (!context) {
    throw new Error('assist request context is not available')
  }
  return context
}

export function requireTaskBoundAssistContext(): AssistRequestContext & {
  taskId: string
  runId: string
} {
  const context = getAssistRequestContext()
  if (!context.taskId || !context.runId) {
    throw AiCollaborationError.fromCode('DELEGATION_INVALID')
  }
  return { ...context, taskId: context.taskId, runId: context.runId }
}

export function requireConversationAssistContext(): AssistRequestContext & {
  conversationId: string
  inputBatchId: string
} {
  const context = getAssistRequestContext()
  if (!context.conversationId || !context.inputBatchId) {
    throw AiCollaborationError.fromCode('DELEGATION_INVALID')
  }
  return {
    ...context,
    conversationId: context.conversationId,
    inputBatchId: context.inputBatchId,
  }
}
