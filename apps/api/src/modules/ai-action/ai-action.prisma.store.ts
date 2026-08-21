import { Injectable } from '@nestjs/common'
import type { AiAction } from '@prisma/client'
import { PrismaService } from '../../database/prisma/prisma.service'
import type {
  AiActionExecutionStatus,
  AiActionRecordDraft,
  AiActionStore,
  AiActionSummary,
} from './ai-action.types'

@Injectable()
export class PrismaAiActionStore implements AiActionStore {
  constructor(private readonly prisma: PrismaService) {}

  async create(draft: AiActionRecordDraft): Promise<AiActionSummary> {
    const row = await this.prisma.aiAction.create({
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
        candidateFieldKeys: draft.candidateFieldKeys,
        executionStatus: draft.executionStatus,
      },
    })
    return toSummary(row)
  }

  async updateExecution(
    id: string,
    executionStatus: AiActionExecutionStatus,
  ): Promise<AiActionSummary> {
    const row = await this.prisma.aiAction.update({
      where: { id },
      data: { executionStatus },
    })
    return toSummary(row)
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
