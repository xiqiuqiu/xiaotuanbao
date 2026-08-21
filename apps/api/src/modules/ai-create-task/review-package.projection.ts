import {
  AiReviewPackageStatus,
  type Prisma,
} from '@prisma/client'
import type { SubmitReviewPackageModelInput } from '@xiaotuanbao/ai-contracts'
import { toStoredCandidates } from './review-package.mapper'

export async function projectPendingReviewPackage(
  tx: Prisma.TransactionClient,
  params: {
    organizationId: string
    taskId: string
    inputBatchId: string
    runId: string
    reviewPackage: SubmitReviewPackageModelInput
    sourceActionId: string
  },
): Promise<string> {
  const task = await tx.aiCreateTask.findFirst({
    where: { id: params.taskId, organizationId: params.organizationId },
    include: {
      draft: true,
      reviewPackages: {
        where: { status: AiReviewPackageStatus.pending },
        take: 1,
      },
    },
  })
  if (!task?.draft) {
    throw new Error('REVIEW_PACKAGE_TASK_MISSING')
  }
  const existing = task.reviewPackages[0]
  if (existing) {
    if (!existing.inputBatchId) {
      await tx.aiReviewPackage.update({
        where: { id: existing.id },
        data: { inputBatchId: params.inputBatchId },
      })
    }
    return existing.id
  }
  if (!params.sourceActionId) {
    throw new Error('REVIEW_PACKAGE_MISSING_ACTION')
  }
  if (task.draft.version !== params.reviewPackage.objectVersion) {
    throw new Error('VERSION_CONFLICT')
  }
  const stored = toStoredCandidates(params.reviewPackage.candidates)
  try {
    const created = await tx.aiReviewPackage.create({
      data: {
        organizationId: params.organizationId,
        taskId: params.taskId,
        runId: params.runId,
        inputBatchId: params.inputBatchId,
        status: AiReviewPackageStatus.pending,
        confirmationUnit: params.reviewPackage.confirmationUnit,
        baseObjectVersion: task.draft.version,
        baselineSnapshot: task.draft.snapshot as Prisma.InputJsonValue,
        candidates: stored as unknown as Prisma.InputJsonValue,
        version: 1,
        sourceActionId: params.sourceActionId,
      },
    })
    return created.id
  } catch (error) {
    if (!isUniqueViolation(error)) {
      throw error
    }
    const raced = await tx.aiReviewPackage.findFirst({
      where: { taskId: params.taskId, status: AiReviewPackageStatus.pending },
      select: { id: true },
    })
    if (!raced) {
      throw error
    }
    return raced.id
  }
}

export function httpPendingReviewDisposition(
  pending: { sourceActionId: string | null } | undefined,
  sourceActionId: string,
): 'create' | 'replay' | 'reject' {
  if (!pending) {
    return 'create'
  }
  return pending.sourceActionId === sourceActionId ? 'replay' : 'reject'
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: string }).code === 'P2002'
  )
}
