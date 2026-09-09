import { AgentTaskType, type Prisma } from '@prisma/client'
import {
  DEPARTURE_OBJECT_TARGET_KIND,
  DEPARTURE_RESOURCE_CONFIRMATION_UNIT,
  DEPARTURE_RESOURCE_REVIEW_PAYLOAD_SCHEMA,
  DEPARTURE_REVIEW_TARGET_KIND,
  SEGMENT_RESOURCE_CONFIRMATION_UNIT,
  SEGMENT_RESOURCE_REVIEW_PAYLOAD_SCHEMA,
  nextReviewItemIdentity,
  reviewItemIdentity,
} from '@xiaotuanbao/ai-contracts'
import { reviewPackageCreateData, departureReviewProposalHash, reviewProposalHash } from './review-package.envelope'
import { toReviewPackageView, toStoredCandidates, reviewConfirmValues, type ReviewPackageProposal } from './review-package.mapper'

const MAX_ITEM_IDENTITY_ALLOCATION_ATTEMPTS = 8

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
    reviewPackage: ReviewPackageProposal
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

  if (params.reviewPackage.reviewPackageId) {
    return revisePendingReviewPackage(tx, params)
  }

  const byAction = await tx.aiReviewPackage.findFirst({
    where: {
      sourceActionId: params.sourceActionId,
      ...(params.itemIdentity ? { itemIdentity: params.itemIdentity } : {}),
    },
    select: { id: true },
  })
  if (byAction) {
    return byAction.id
  }

  const target = params.target ?? (await resolveReviewPackageTarget(tx, params))
  if (target.version !== params.reviewPackage.objectVersion) {
    throw new Error('VERSION_CONFLICT')
  }

  let itemIdentity = params.itemIdentity ?? (await allocateNextItemIdentity(tx, params.inputBatchId))
  for (let attempt = 0; attempt < MAX_ITEM_IDENTITY_ALLOCATION_ATTEMPTS; attempt += 1) {
    const identity = {
      inputBatchId: params.inputBatchId,
      itemIdentity,
    }
    const existing = await findReviewPackageByItemIdentity(tx, identity)
    if (existing) {
      if (existing.sourceActionId === params.sourceActionId) {
        return existing.id
      }
      if (params.itemIdentity) {
        throw new Error('REVIEW_ITEM_IDENTITY_TAKEN')
      }
      itemIdentity = await allocateNextItemIdentity(tx, params.inputBatchId, [itemIdentity])
      continue
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
      if (raced.sourceActionId === params.sourceActionId) {
        return raced.id
      }
      if (params.itemIdentity) {
        throw error
      }
      itemIdentity = await allocateNextItemIdentity(tx, params.inputBatchId, [
        itemIdentity,
        raced.itemIdentity,
      ])
    }
  }
  throw new Error('REVIEW_ITEM_IDENTITY_EXHAUSTED')
}

async function revisePendingReviewPackage(
  tx: Prisma.TransactionClient,
  params: Parameters<typeof projectPendingReviewPackage>[1],
): Promise<string> {
  const target = params.target ?? (await resolveReviewPackageTarget(tx, params))
  const pkg = await tx.aiReviewPackage.findFirst({
    where: {
      id: params.reviewPackage.reviewPackageId,
      organizationId: params.organizationId,
      taskId: params.taskId,
      conversationId: params.conversationId,
      confirmationUnit: params.reviewPackage.confirmationUnit,
      targetKind: target.kind,
      targetId: target.id,
    },
    include: { task: { select: { ownerUserId: true } } },
  })
  if (!pkg?.task) throw new Error('REVIEW_PACKAGE_TASK_MISSING')
  const decisionCommandId = `agent-revise:${params.sourceActionId}`
  const replay = await tx.aiReviewRecord.findFirst({
    where: { packageId: pkg.id, organizationId: params.organizationId, decisionCommandId },
    select: { id: true },
  })
  if (replay) return pkg.id
  if (pkg.status !== 'pending' || pkg.version !== params.reviewPackage.expectedPackageVersion || target.version !== params.reviewPackage.objectVersion) {
    throw new Error('VERSION_CONFLICT')
  }
  const before = toReviewPackageView(pkg)
  if (!before.schemaSupported) throw new Error('REVIEW_PACKAGE_SCHEMA_UNSUPPORTED')
  const { corrections, submissions: beforeValues } = reviewConfirmValues(before.candidates)
  const candidates = new Map(toStoredCandidates(before.candidates.filter((candidate) => candidate.evidence.length > 0)).map((candidate) => [candidate.fieldKey, candidate]))
  const conflicts = new Map((before.conflicts ?? []).map((conflict) => [conflict.fieldKey, conflict]))
  for (const candidate of toStoredCandidates(params.reviewPackage.candidates)) {
    const previous = candidates.get(candidate.fieldKey)
    const hasCorrection = Object.hasOwn(corrections, candidate.fieldKey)
    const agreesWithCorrection = hasCorrection && reviewProposalHash(candidate.proposedValue) === reviewProposalHash(corrections[candidate.fieldKey])
    if (agreesWithCorrection) conflicts.delete(candidate.fieldKey)
    else if (hasCorrection && (conflicts.has(candidate.fieldKey) || reviewProposalHash(previous?.proposedValue ?? null) !== reviewProposalHash(candidate.proposedValue))) {
      conflicts.set(candidate.fieldKey, { fieldKey: candidate.fieldKey, proposedValue: candidate.proposedValue, userCorrectedValue: corrections[candidate.fieldKey] })
    }
    candidates.set(candidate.fieldKey, candidate)
  }
  const nextCandidates = [...candidates.values()]
  const afterValues = { ...Object.fromEntries(nextCandidates.map((candidate) => [candidate.fieldKey, candidate.proposedValue])), ...corrections }
  const baseline = pkg.baselineSnapshot && typeof pkg.baselineSnapshot === 'object' && !Array.isArray(pkg.baselineSnapshot) ? pkg.baselineSnapshot : {}
  const updated = await tx.aiReviewPackage.updateMany({
    where: { id: pkg.id, organizationId: params.organizationId, status: 'pending', version: pkg.version },
    data: {
      version: { increment: 1 },
      sourceActionId: params.sourceActionId,
      attemptId: params.attemptId,
      baseObjectVersion: target.version,
      proposalHash: departureReviewProposalHash({ ...params.reviewPackage, candidates: nextCandidates }),
      candidates: nextCandidates as unknown as Prisma.InputJsonValue,
      userCorrections: corrections as Prisma.InputJsonValue,
      baselineSnapshot: { ...baseline, reviewConflicts: [...conflicts.values()] } as Prisma.InputJsonValue,
    },
  })
  if (updated.count !== 1) throw new Error('VERSION_CONFLICT')
  await tx.aiReviewRecord.create({
    data: {
      organizationId: params.organizationId,
      packageId: pkg.id,
      operatorUserId: pkg.task.ownerUserId,
      action: 'revise',
      decisionCommandId,
      packageVersion: pkg.version + 1,
      originalCandidates: pkg.candidates as Prisma.InputJsonValue,
      userCorrections: corrections as Prisma.InputJsonValue,
      submittedValues: afterValues as Prisma.InputJsonValue,
      beforeSnapshot: beforeValues as Prisma.InputJsonValue,
      afterSnapshot: afterValues as Prisma.InputJsonValue,
      evidence: nextCandidates.flatMap((candidate) => candidate.evidence) as Prisma.InputJsonValue,
      objectVersion: target.version,
      writeResult: 'success',
    },
  })
  return pkg.id
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
    reviewPackages: readonly ReviewPackageProposal[]
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
    reviewPackage: ReviewPackageProposal
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
      version: departureObjectVersion(agentTask.departure.updatedAt),
      snapshot: {
        departureId: agentTask.departure.id,
        departureNo: agentTask.departure.departureNo,
        name: agentTask.departure.name,
        status: agentTask.departure.status,
      } as Prisma.InputJsonValue,
      payloadSchema:
        params.reviewPackage.confirmationUnit === SEGMENT_RESOURCE_CONFIRMATION_UNIT
          ? SEGMENT_RESOURCE_REVIEW_PAYLOAD_SCHEMA
          : params.reviewPackage.confirmationUnit === DEPARTURE_RESOURCE_CONFIRMATION_UNIT
            ? DEPARTURE_RESOURCE_REVIEW_PAYLOAD_SCHEMA
          : undefined,
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

async function allocateNextItemIdentity(
  tx: Prisma.TransactionClient,
  inputBatchId: string,
  extraIdentities: readonly string[] = [],
): Promise<string> {
  const rows = await tx.aiReviewPackage.findMany({
    where: { inputBatchId },
    select: { itemIdentity: true },
  })
  return nextReviewItemIdentity([...rows.map((row) => row.itemIdentity), ...extraIdentities])
}

export function departureObjectVersion(updatedAt: Date | string): number {
  const value = updatedAt instanceof Date ? updatedAt.getTime() : Date.parse(updatedAt)
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('REVIEW_PACKAGE_TASK_MISSING')
  }
  return value
}
