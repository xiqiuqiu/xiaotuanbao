import { AiAgentAttemptStatus } from '@prisma/client'

export function canCommitAttemptTerminal(
  attempt: { status: AiAgentAttemptStatus; generation: number } | null,
  jobGeneration: number,
): boolean {
  return (
    attempt != null &&
    attempt.status === AiAgentAttemptStatus.running &&
    attempt.generation === jobGeneration
  )
}

/** 权威结果已落库后，SSE / 即时输出通知失败不得再抛出让 Worker 回滚或重试。 */
export async function notifyCommittedConversationEvents(
  publish: () => Promise<void>,
  onRelayFault: (error: unknown) => void,
): Promise<void> {
  try {
    await publish()
  } catch (error: unknown) {
    onRelayFault(error)
  }
}
