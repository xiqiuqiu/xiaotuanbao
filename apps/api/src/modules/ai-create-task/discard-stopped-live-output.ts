import type { AgentLiveOutput } from './agent-live-output'

type StopEvent = {
  payload?: Record<string, unknown>
}

function stoppedAttemptId(events: StopEvent[]): string | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const payload = events[index]?.payload
    if (payload?.status !== 'cancelled' || payload.reason !== 'user_stop') {
      continue
    }
    return typeof payload.attemptId === 'string' ? payload.attemptId : null
  }
  return null
}

function stoppedBatchId(events: StopEvent[]): string | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const payload = events[index]?.payload
    if (payload?.status !== 'cancelled' || payload.reason !== 'user_stop') {
      continue
    }
    return typeof payload.batchId === 'string' ? payload.batchId : null
  }
  return null
}

/** 停止命令持久化取消之后：只删除该次停止对应 Attempt / 批次的即时输出。 */
export async function discardLiveOutputAfterUserStop(
  live: AgentLiveOutput,
  conversationId: string,
  events: StopEvent[],
): Promise<void> {
  const attemptId = stoppedAttemptId(events)
  if (attemptId) {
    await live.clear(attemptId)
    return
  }
  const batchId = stoppedBatchId(events)
  if (!batchId) {
    return
  }
  const current = await live.getCurrent(conversationId)
  if (current?.batchId === batchId) {
    await live.clear(current.attemptId)
  }
}

