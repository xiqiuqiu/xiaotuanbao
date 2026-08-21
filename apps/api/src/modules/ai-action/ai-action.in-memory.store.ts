import { randomUUID } from 'node:crypto'
import type {
  AiActionExecutionStatus,
  AiActionRecordDraft,
  AiActionStore,
  AiActionSummary,
} from './ai-action.types'

export class InMemoryAiActionStore implements AiActionStore {
  readonly records: AiActionSummary[] = []

  async create(draft: AiActionRecordDraft): Promise<AiActionSummary> {
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
