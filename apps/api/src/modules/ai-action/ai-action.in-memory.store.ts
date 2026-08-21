import { randomUUID } from 'node:crypto'
import { replayKeyFromDraft } from './ai-action.replay'
import type {
  AiActionExecutionStatus,
  AiActionRecordDraft,
  AiActionStore,
  AiActionSummary,
} from './ai-action.types'

export class InMemoryAiActionStore implements AiActionStore {
  readonly records: AiActionSummary[] = []
  private readonly byReplayKey = new Map<string, AiActionSummary>()

  async findOrCreate(draft: AiActionRecordDraft): Promise<AiActionSummary> {
    const replayKey = replayKeyFromDraft(draft)
    const existing = this.byReplayKey.get(replayKey)
    if (existing) {
      return existing
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
    }
    this.byReplayKey.set(replayKey, record)
    this.records.push(record)
    return record
  }

  async updateExecution(
    id: string,
    executionStatus: AiActionExecutionStatus,
  ): Promise<AiActionSummary> {
    const record = this.records.find((item) => item.id === id)
    if (!record) {
      throw new Error(`AI 动作不存在: ${id}`)
    }
    record.executionStatus = executionStatus
    return record
  }
}

export class FailingAiActionStore implements AiActionStore {
  async findOrCreate(_draft: AiActionRecordDraft): Promise<AiActionSummary> {
    throw new Error('decision store unavailable')
  }

  async updateExecution(
    _id: string,
    _executionStatus: AiActionExecutionStatus,
  ): Promise<AiActionSummary> {
    throw new Error('decision store unavailable')
  }
}
