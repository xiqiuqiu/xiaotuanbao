import {
  AiWorkflowJobStatus,
  AiWorkflowJobType,
  type Prisma,
} from '@prisma/client'

export async function findInFlightReviewConfirmJob(
  tx: Prisma.TransactionClient,
  reviewPackageId: string,
  excludeJobKey?: string,
): Promise<{ id: string } | null> {
  return tx.aiWorkflowJob.findFirst({
    where: {
      reviewPackageId,
      type: AiWorkflowJobType.review_confirm,
      status: { in: [AiWorkflowJobStatus.pending, AiWorkflowJobStatus.claimed] },
      ...(excludeJobKey ? { jobKey: { not: excludeJobKey } } : {}),
    },
    select: { id: true },
  })
}
