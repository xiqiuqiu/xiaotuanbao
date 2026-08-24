import {
  AgentTaskStatus,
  AiActionExecutionStatus,
  AiAgentAttemptStatus,
  AiConversationInteractionStatus,
  AiInputBatchStatus,
  InputBatchTaskRole,
  AiReviewPackageStatus,
  AiWorkflowJobStatus,
  type Prisma,
} from '@prisma/client'

const OPEN_AGENT_TASK_STATUSES: AgentTaskStatus[] = [
  AgentTaskStatus.proposed,
  AgentTaskStatus.active,
  AgentTaskStatus.waiting,
]

export function isOpenAgentTaskStatus(
  status: AgentTaskStatus | null | undefined,
): boolean {
  return status != null && OPEN_AGENT_TASK_STATUSES.includes(status)
}

export async function isolateOpenTaskRuntime(
  tx: Prisma.TransactionClient,
  params: { taskId: string; errorCode: string },
): Promise<void> {
  const { taskId, errorCode } = params
  const batchScope = {
    taskLinks: {
      some: {
        taskId,
        role: { in: [InputBatchTaskRole.primary, InputBatchTaskRole.created] },
      },
    },
  }

  await tx.aiWorkflowJob.updateMany({
    where: {
      inputBatch: batchScope,
      status: { in: [AiWorkflowJobStatus.pending, AiWorkflowJobStatus.claimed] },
    },
    data: {
      status: AiWorkflowJobStatus.failed,
      lastErrorCode: errorCode,
      leaseExpiresAt: null,
      generation: { increment: 1 },
    },
  })
  await tx.aiAgentAttempt.updateMany({
    where: {
      inputBatch: batchScope,
      status: AiAgentAttemptStatus.running,
    },
    data: {
      status: AiAgentAttemptStatus.failed,
      errorCode,
      endedAt: new Date(),
    },
  })
  await tx.aiConversationInteraction.updateMany({
    where: {
      inputBatch: batchScope,
      status: AiConversationInteractionStatus.pending,
    },
    data: {
      status: AiConversationInteractionStatus.cancelled,
      version: { increment: 1 },
    },
  })
  await tx.aiReviewPackage.updateMany({
    where: { taskId, status: AiReviewPackageStatus.pending },
    data: {
      status: AiReviewPackageStatus.superseded,
      version: { increment: 1 },
    },
  })
  await tx.aiInputBatch.updateMany({
    where: {
      ...batchScope,
      status: {
        in: [
          AiInputBatchStatus.waiting_for_materials,
          AiInputBatchStatus.ready_for_agent,
          AiInputBatchStatus.agent_running,
          AiInputBatchStatus.awaiting_user_input,
          AiInputBatchStatus.awaiting_review,
        ],
      },
    },
    data: { status: AiInputBatchStatus.cancelled },
  })
  await tx.aiAction.updateMany({
    where: {
      taskId,
      executionStatus: AiActionExecutionStatus.not_started,
    },
    data: { executionStatus: AiActionExecutionStatus.skipped },
  })
}
