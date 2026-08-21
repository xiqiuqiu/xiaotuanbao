import { Injectable } from '@nestjs/common'
import type { AiAction, Prisma } from '@prisma/client'
import { PrismaService } from '../../database/prisma/prisma.service'
import { replayKeyFromDraft } from './ai-action.replay'
import { repeatFingerprintFrom } from './ai-action.repeat'
import type {
  AiActionExecutionStatus,
  AiActionFindOrCreateResult,
  AiActionRecordDraft,
  AiActionRepeatObservationDraft,
  AiActionStore,
  AiActionSummary,
} from './ai-action.types'

const OBSERVATION_SAVEPOINT = 'ai_action_repeat_obs'

type AiActionDb = {
  aiAction: Prisma.TransactionClient['aiAction']
  aiActionRepeatObservation: Prisma.TransactionClient['aiActionRepeatObservation']
  $executeRawUnsafe: Prisma.TransactionClient['$executeRawUnsafe']
}

export function createPrismaAiActionStore(client: AiActionDb): AiActionStore {
  return {
    async findOrCreate(draft) {
      const replayKey = replayKeyFromDraft(draft)
      const existing = await client.aiAction.findUnique({ where: { replayKey } })
      if (existing) {
        return { action: toSummary(existing), created: false }
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
        return { action: toSummary(row), created: true }
      } catch (error) {
        if (!isUniqueViolation(error)) {
          throw error
        }
        const raced = await client.aiAction.findUnique({ where: { replayKey } })
        if (!raced) {
          throw error
        }
        return { action: toSummary(raced), created: false }
      }
    },
    async updateExecution(id, executionStatus) {
      const row = await client.aiAction.update({
        where: { id },
        data: { executionStatus },
      })
      return toSummary(row)
    },
    async observeRepeat(draft) {
      await isolateObservationFromCallerTransaction(client, async () => {
        const prior = await client.aiAction.count({
          where: {
            organizationId: draft.organizationId,
            name: draft.name,
            targetKind: draft.targetRef?.kind ?? null,
            targetId: draft.targetRef?.id ?? null,
            inputHash: draft.inputHash,
            NOT: { id: draft.actionId },
          },
        })
        if (prior === 0) {
          return
        }
        await client.aiActionRepeatObservation.create({
          data: {
            organizationId: draft.organizationId,
            actionId: draft.actionId,
            fingerprint: repeatFingerprintFrom(draft),
          },
        })
      })
    },
  }
}

@Injectable()
export class PrismaAiActionStore implements AiActionStore {
  private readonly inner: AiActionStore

  constructor(prisma: PrismaService) {
    this.inner = createPrismaAiActionStore(prisma)
  }

  findOrCreate(draft: AiActionRecordDraft): Promise<AiActionFindOrCreateResult> {
    return this.inner.findOrCreate(draft)
  }

  updateExecution(
    id: string,
    executionStatus: AiActionExecutionStatus,
  ): Promise<AiActionSummary> {
    return this.inner.updateExecution(id, executionStatus)
  }

  observeRepeat(draft: AiActionRepeatObservationDraft): Promise<void> {
    return this.inner.observeRepeat(draft)
  }
}

async function isolateObservationFromCallerTransaction(
  client: Pick<AiActionDb, '$executeRawUnsafe'>,
  run: () => Promise<void>,
): Promise<void> {
  let opened = false
  try {
    await client.$executeRawUnsafe(`SAVEPOINT ${OBSERVATION_SAVEPOINT}`)
    opened = true
  } catch {
    await run()
    return
  }

  try {
    await run()
    await client.$executeRawUnsafe(`RELEASE SAVEPOINT ${OBSERVATION_SAVEPOINT}`)
  } catch (error) {
    if (opened) {
      try {
        await client.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${OBSERVATION_SAVEPOINT}`)
      } catch {
        // 观测失败已注定；尽量让外层事务可继续
      }
    }
    throw error
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
