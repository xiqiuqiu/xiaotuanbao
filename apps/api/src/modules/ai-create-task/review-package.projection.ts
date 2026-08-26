import { type Prisma } from '@prisma/client'
import {
  AI_CREATE_CAPABILITY_REFS_BY_TOOL,
  DEPARTURE_REVIEW_TARGET_KIND,
  type SubmitReviewPackageModelInput,
} from '@xiaotuanbao/ai-contracts'
import { reviewPackageCreateData, departureReviewProposalHash } from './review-package.envelope'

export async function projectPendingReviewPackage(
  tx: Prisma.TransactionClient,
  params: {
    organizationId: string
    taskId: string
    conversationId: string
    inputBatchId: string
    attemptId?: string | null
    reviewPackage: SubmitReviewPackageModelInput
    sourceActionId: string
  },
): Promise<string> {
  const task = await tx.aiCreateTask.findFirst({
    where: { id: params.taskId, agentTask: { organizationId: params.organizationId } },
    include: { draft: true },
  })
  if (!task?.draft) {
    throw new Error('REVIEW_PACKAGE_TASK_MISSING')
  }
  if (!params.sourceActionId) {
    throw new Error('REVIEW_PACKAGE_MISSING_ACTION')
  }
  if (!params.conversationId || !params.inputBatchId) {
    throw new Error('REVIEW_PACKAGE_MISSING_SOURCE')
  }
  if (task.draft.version !== params.reviewPackage.objectVersion) {
    throw new Error('VERSION_CONFLICT')
  }

  const identity = {
    inputBatchId: params.inputBatchId,
    capabilityVersion: AI_CREATE_CAPABILITY_REFS_BY_TOOL.submitReviewPackage.version,
    targetKind: DEPARTURE_REVIEW_TARGET_KIND,
    targetId: task.draft.id,
    proposalHash: departureReviewProposalHash(params.reviewPackage),
  }
  const existing = await findReviewPackageByProposalIdentity(tx, identity)
  if (existing) {
    return existing.id
  }

  try {
    const created = await tx.aiReviewPackage.create({
      data: reviewPackageCreateData({
        organizationId: params.organizationId,
        taskId: params.taskId,
        conversationId: params.conversationId,
        inputBatchId: params.inputBatchId,
        attemptId: params.attemptId,
        sourceActionId: params.sourceActionId,
        targetId: task.draft.id,
        baseObjectVersion: task.draft.version,
        baselineSnapshot: task.draft.snapshot as Prisma.InputJsonValue,
        reviewPackage: params.reviewPackage,
      }),
    })
    return created.id
  } catch (error) {
    if (!isUniqueViolation(error)) {
      throw error
    }
    const raced = await findReviewPackageByProposalIdentity(tx, identity)
    if (!raced) {
      throw error
    }
    return raced.id
  }
}

export async function findReviewPackageByProposalIdentity(
  tx: Prisma.TransactionClient,
  identity: {
    inputBatchId: string
    capabilityVersion: number
    targetKind: string
    targetId: string
    proposalHash: string
  },
): Promise<{ id: string; sourceActionId: string | null; candidates: Prisma.JsonValue } | null> {
  return tx.aiReviewPackage.findFirst({
    where: identity,
    select: { id: true, sourceActionId: true, candidates: true },
  })
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: string }).code === 'P2002'
  )
}


