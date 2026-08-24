import { randomUUID } from 'node:crypto'
import { repeatFingerprintFrom, sameRepeatTarget } from './ai-action.repeat'
import { replayKeyFromDraft } from './ai-action.replay'
import type {
  AiActionExecutionStatus,
  AiActionFindOrCreateResult,
  AiActionRecordDraft,
  AiActionRepeatObservation,
  AiActionRepeatObservationDraft,
  AiActionStore,
  AiActionSummary,
} from './ai-action.types'

export class InMemoryAiActionStore implements AiActionStore {
  readonly records: AiActionSummary[] = []
  readonly observations: AiActionRepeatObservation[] = []
  private readonly byReplayKey = new Map<string, AiActionSummary>()
  private readonly organizationById = new Map<string, string>()

  async findOrCreate(draft: AiActionRecordDraft): Promise<AiActionFindOrCreateResult> {
    const replayKey = replayKeyFromDraft(draft)
    const existing = this.byReplayKey.get(replayKey)
    if (existing) {
      return { action: existing, created: false }
    }
    const record: AiActionSummary = {
      id: randomUUID(),
      name: draft.name,
      kind: draft.kind,
      decision: draft.decision,
      reasonCode: draft.reasonCode,
      targetRef: draft.targetRef,
      inputHash: draft.inputHash,
      candidateFieldKeys: draft.candidateFieldKeys,
      executionStatus: draft.executionStatus,
      agentDefinition: draft.agentDefinition,
      capability: draft.capability,
    }
    this.byReplayKey.set(replayKey, record)
    this.organizationById.set(record.id, draft.organizationId)
    this.records.push(record)
    return { action: record, created: true }
  }

  async updateExecution(
    id: string,
    executionStatus: AiActionExecutionStatus,
  ): Promise<AiActionSummary> {
    const record = this.records.find((item) => item.id === id)
    if (!record) {
      throw new Error(`AI 动作不存在: ${id}`)
    }
    if (record.executionStatus === 'not_started') {
      record.executionStatus = executionStatus
    }
    return record
  }

  async observeRepeat(draft: AiActionRepeatObservationDraft): Promise<void> {
    const prior = this.records.some(
      (record) =>
        record.id !== draft.actionId &&
        this.organizationById.get(record.id) === draft.organizationId &&
        record.name === draft.name &&
        record.inputHash === draft.inputHash &&
        sameRepeatTarget(record.targetRef, draft.targetRef),
    )
    if (!prior) {
      return
    }
    this.observations.push({
      fingerprint: repeatFingerprintFrom(draft),
      actionId: draft.actionId,
    })
  }
}

export class FailingAiActionStore implements AiActionStore {
  async findOrCreate(_draft: AiActionRecordDraft): Promise<AiActionFindOrCreateResult> {
    throw new Error('decision store unavailable')
  }

  async updateExecution(
    _id: string,
    _executionStatus: AiActionExecutionStatus,
  ): Promise<AiActionSummary> {
    throw new Error('decision store unavailable')
  }

  async observeRepeat(_draft: AiActionRepeatObservationDraft): Promise<void> {
    throw new Error('decision store unavailable')
  }
}

export class ObservationFailingAiActionStore extends InMemoryAiActionStore {
  override async observeRepeat(_draft: AiActionRepeatObservationDraft): Promise<void> {
    throw new Error('observation store unavailable')
  }
}
