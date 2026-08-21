import { Injectable } from '@nestjs/common'
import type { AiAction, Prisma } from '@prisma/client'
import { PrismaService } from '../../database/prisma/prisma.service'
import { replayKeyFromDraft } from './ai-action.replay'
import type {
  AiActionExecutionStatus,
  AiActionRecordDraft,
  AiActionStore,
  AiActionSummary,
} from './ai-action.types'

type AiActionDb = { aiAction: Prisma.TransactionClient['aiAction'] }

export function createPrismaAiActionStore(client: AiActionDb): AiActionStore {
  return {
    async findOrCreate(draft) {
      const replayKey = replayKeyFromDraft(draft)
      const existing = await client.aiAction.findUnique({ where: { replayKey } })
      if (existing) {
        return toSummary(existing)
      }
      try {
        const row = await client.aiAction.create({
          data: {
            organizationId: draft.organizationId,
            userId: draft.userId,
            taskId: draft.taskId,
            conversationId: draft.conversationId,
            inputBatchId: draft.inputBatchId,
            runId: draft.runId,
            attemptId: draft.attemptId,
            contextManifestId: draft.contextManifestId,
            name: draft.name,
            kind: draft.kind,
            decision: draft.decision,
            reasonCode: draft.reasonCode,
            targetKind: draft.targetRef?.kind,
            targetId: draft.targetRef?.id,
            inputHash: draft.inputHash,
            replayKey,
            candidateFieldKeys: draft.candidateFieldKeys,
            executionStatus: draft.executionStatus,
          },
        })
        return toSummary(row)
      } catch (error) {
        if (!isUniqueViolation(error)) {
          throw error
        }
        const raced = await client.aiAction.findUnique({ where: { replayKey } })
        if (!raced) {
          throw error
        }
        return toSummary(raced)
      }
    },
    async updateExecution(id, executionStatus) {
      const row = await client.aiAction.update({
        where: { id },
        data: { executionStatus },
      })
      return toSummary(row)
    },
  }
}

@Injectable()
export class PrismaAiActionStore implements AiActionStore {
  private readonly inner: AiActionStore

  constructor(prisma: PrismaService) {
    this.inner = createPrismaAiActionStore(prisma)
  }

  findOrCreate(draft: AiActionRecordDraft): Promise<AiActionSummary> {
    return this.inner.findOrCreate(draft)
  }

  updateExecution(
    id: string,
    executionStatus: AiActionExecutionStatus,
  ): Promise<AiActionSummary> {
    return this.inner.updateExecution(id, executionStatus)
  }
}

function toSummary(row: AiAction): AiActionSummary {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    decision: row.decision,
    reasonCode: row.reasonCode,
    targetRef:
      row.targetKind || row.targetId
        ? { kind: row.targetKind ?? 'unknown', id: row.targetId }
        : null,
    inputHash: row.inputHash,
    candidateFieldKeys: row.candidateFieldKeys,
    executionStatus: row.executionStatus,
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: string }).code === 'P2002'
  )
}
