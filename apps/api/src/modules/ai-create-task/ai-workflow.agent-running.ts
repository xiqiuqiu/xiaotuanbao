import {
  AiConversationEventKind,
  AiInputBatchStatus,
  type Prisma,
} from '@prisma/client'

export function agentRunningBatchStatusPayload(params: {
  batchId: string
  attemptId: string
  generation: number
}): {
  batchId: string
  status: typeof AiInputBatchStatus.agent_running
  attemptId: string
  generation: number
} {
  return {
    batchId: params.batchId,
    status: AiInputBatchStatus.agent_running,
    attemptId: params.attemptId,
    generation: params.generation,
  }
}

type AppendEvent = (
  tx: Prisma.TransactionClient,
  params: {
    organizationId: string
    conversationId: string
    kind: AiConversationEventKind
    payload: Prisma.InputJsonValue
  },
) => Promise<{ id: string }>

/** 批次进入 AI 处理中：Attempt 行必须已经存在，再追加带 attemptId 与 generation 的 batch_status。已是 agent_running 时仍追加，让租约恢复的新 Attempt 也有稳定主键。 */
export async function markBatchAgentRunningAfterAttempt(
  tx: Prisma.TransactionClient,
  appendEvent: AppendEvent,
  params: {
    organizationId: string
    conversationId: string
    batchId: string
    attemptId: string
    generation: number
  },
): Promise<string> {
  const batch = await tx.aiInputBatch.findUniqueOrThrow({
    where: { id: params.batchId },
    select: { status: true },
  })
  if (batch.status !== AiInputBatchStatus.agent_running) {
    await tx.aiInputBatch.update({
      where: { id: params.batchId },
      data: { status: AiInputBatchStatus.agent_running },
    })
  }
  const statusEvent = await appendEvent(tx, {
    organizationId: params.organizationId,
    conversationId: params.conversationId,
    kind: AiConversationEventKind.batch_status,
    payload: agentRunningBatchStatusPayload({
      batchId: params.batchId,
      attemptId: params.attemptId,
      generation: params.generation,
    }),
  })
  return statusEvent.id
}
