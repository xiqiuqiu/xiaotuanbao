import { AsyncLocalStorage } from 'node:async_hooks'

export interface AssistRequestContext {
  delegationToken: string
  taskId: string
  runId: string
  conversationId?: string
  inputBatchId?: string
  attemptId?: string
  contextManifestId?: string
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
