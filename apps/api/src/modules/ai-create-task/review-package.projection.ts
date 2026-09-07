import { AgentTaskType, type Prisma } from '@prisma/client'
import {
  DEPARTURE_OBJECT_TARGET_KIND,
  DEPARTURE_REVIEW_TARGET_KIND,
  reviewItemIdentity,
  type SubmitReviewPackageModelInput,
} from '@xiaotuanbao/ai-contracts'
import { reviewPackageCreateData } from './review-package.envelope'

export type ReviewPackageTarget = {
  kind: string
  id: string
  version: number
  snapshot: Prisma.InputJsonValue
  payloadSchema?: string
}

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
    itemIdentity?: string
    target?: ReviewPackageTarget
  },
): Promise<string> {
  if (!params.sourceActionId) {
    throw new Error('REVIEW_PACKAGE_MISSING_ACTION')
  }
  if (!params.conversationId || !params.inputBatchId) {
    throw new Error('REVIEW_PACKAGE_MISSING_SOURCE')
  }

  const byAction = await tx.aiReviewPackage.findFirst({
    where: { sourceActionId: params.sourceActionId },
    select: { id: true },
  })
  if (byAction) {
    return byAction.id
  }

  const target = params.target ?? (await resolveReviewPackageTarget(tx, params))
  if (target.version !== params.reviewPackage.objectVersion) {
    throw new Error('VERSION_CONFLICT')
  }

  const itemIdentity =
    params.itemIdentity ??
    reviewItemIdentity(
      await tx.aiReviewPackage.count({
        where: { inputBatchId: params.inputBatchId },
      }),
    )
  const identity = {
    inputBatchId: params.inputBatchId,
    itemIdentity,
  }
  const existing = await findReviewPackageByItemIdentity(tx, identity)
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
        targetKind: target.kind,
        targetId: target.id,
        itemIdentity,
        payloadSchema: target.payloadSchema,
        baseObjectVersion: target.version,
        baselineSnapshot: target.snapshot,
        reviewPackage: params.reviewPackage,
      }),
    })
    return created.id
  } catch (error) {
    if (!isUniqueViolation(error)) {
      throw error
    }
    const raced = await findReviewPackageByItemIdentity(tx, identity)
    if (!raced) {
      throw error
    }
    return raced.id
  }
}

export async function projectPendingReviewPackages(
  tx: Prisma.TransactionClient,
  params: {
    organizationId: string
    taskId: string
    conversationId: string
    inputBatchId: string
    attemptId?: string | null
    sourceActionId: string
    reviewPackages: readonly SubmitReviewPackageModelInput[]
    target?: ReviewPackageTarget
  },
): Promise<string[]> {
  const ids: string[] = []
  for (const [ordinal, reviewPackage] of params.reviewPackages.entries()) {
    ids.push(
      await projectPendingReviewPackage(tx, {
        organizationId: params.organizationId,
        taskId: params.taskId,
        conversationId: params.conversationId,
        inputBatchId: params.inputBatchId,
        attemptId: params.attemptId,
        sourceActionId: params.sourceActionId,
        reviewPackage,
        itemIdentity: reviewItemIdentity(ordinal),
        target: params.target,
      }),
    )
  }
  return ids
}

async function resolveReviewPackageTarget(
  tx: Prisma.TransactionClient,
  params: {
    organizationId: string
    taskId: string
    reviewPackage: SubmitReviewPackageModelInput
  },
): Promise<ReviewPackageTarget> {
  const agentTask = await tx.agentTask.findFirst({
    where: { id: params.taskId, organizationId: params.organizationId },
    include: {
      departure: true,
      departureCreationTask: { include: { draft: true } },
    },
  })
  if (!agentTask) {
    throw new Error('REVIEW_PACKAGE_TASK_MISSING')
  }
  if (agentTask.type === AgentTaskType.departure_collaboration) {
    if (!agentTask.departure) {
      throw new Error('REVIEW_PACKAGE_TASK_MISSING')
    }
    return {
      kind: DEPARTURE_OBJECT_TARGET_KIND,
      id: agentTask.departure.id,
      version: params.reviewPackage.objectVersion,
      snapshot: {
        departureId: agentTask.departure.id,
        departureNo: agentTask.departure.departureNo,
        name: agentTask.departure.name,
        status: agentTask.departure.status,
      } as Prisma.InputJsonValue,
    }
  }
  const draft = agentTask.departureCreationTask?.draft
  if (!draft) {
    throw new Error('REVIEW_PACKAGE_TASK_MISSING')
  }
  return {
    kind: DEPARTURE_REVIEW_TARGET_KIND,
    id: draft.id,
    version: draft.version,
    snapshot: draft.snapshot as Prisma.InputJsonValue,
  }
}

export async function findReviewPackageByItemIdentity(
  tx: Prisma.TransactionClient,
  identity: {
    inputBatchId: string
    itemIdentity: string
  },
): Promise<{
  id: string
  sourceActionId: string | null
  candidates: Prisma.JsonValue
  payloadSchema: string
  confirmationUnit: string
  targetKind: string
  itemIdentity: string
} | null> {
  return tx.aiReviewPackage.findFirst({
    where: identity,
    select: {
      id: true,
      sourceActionId: true,
      candidates: true,
      payloadSchema: true,
      confirmationUnit: true,
      targetKind: true,
      itemIdentity: true,
    },
  })
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
): Promise<{
  id: string
  sourceActionId: string | null
  candidates: Prisma.JsonValue
  payloadSchema: string
  confirmationUnit: string
  targetKind: string
} | null> {
  return tx.aiReviewPackage.findFirst({
    where: identity,
    select: {
      id: true,
      sourceActionId: true,
      candidates: true,
      payloadSchema: true,
      confirmationUnit: true,
      targetKind: true,
    },
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
