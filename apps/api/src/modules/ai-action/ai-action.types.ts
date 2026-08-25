export type AiActionDecision = 'allow' | 'review' | 'deny'

export type AiActionKind = 'read' | 'write'

export type AiActionExecutionStatus = 'not_started' | 'succeeded' | 'failed' | 'skipped'

export type AiActionTargetRef = {
  kind: string
  id: string | null
}

export type AiActionSummary = {
  id: string
  name: string
  kind: AiActionKind
  decision: AiActionDecision
  reasonCode: string
  targetRef: AiActionTargetRef | null
  inputHash: string
  candidateFieldKeys: string[]
  executionStatus: AiActionExecutionStatus
  agentDefinition: { key: string; version: number }
  capability: { key: string; version: number } | null
}

export type AiActionActor = {
  organizationId: string
  agentDefinition: { key: string; version: number }
  grantedCapabilities: Array<{ key: string; version: number }>
  userId?: string
  taskId?: string
  conversationId?: string
  inputBatchId?: string
  runId?: string
  attemptId?: string
  contextManifestId?: string
}

export type AiActionForwardContext = {
  action: AiActionSummary | null
}

export type AiActionProposal = {
  name: string
  actor: AiActionActor
  input: unknown
  forward: (context: AiActionForwardContext) => Promise<unknown>
}

export type AiActionExecuteResult = {
  action: AiActionSummary | null
  result?: unknown
}

export type AiActionRecordDraft = {
  organizationId: string
  userId?: string
  taskId?: string
  conversationId?: string
  inputBatchId?: string
  runId?: string
  attemptId?: string
  contextManifestId?: string
  name: string
  kind: AiActionKind
  decision: AiActionDecision
  reasonCode: string
  targetRef: AiActionTargetRef | null
  inputHash: string
  candidateFieldKeys: string[]
  executionStatus: AiActionExecutionStatus
  agentDefinition: { key: string; version: number }
  capability: { key: string; version: number } | null
}

export type AiActionFindOrCreateResult = {
  action: AiActionSummary
  created: boolean
}

export type AiActionRepeatObservationDraft = {
  organizationId: string
  name: string
  targetRef: AiActionTargetRef | null
  inputHash: string
  actionId: string
}

export type AiActionRepeatObservation = {
  fingerprint: string
  actionId: string | null
}

export interface AiActionStore {
  findOrCreate(draft: AiActionRecordDraft): Promise<AiActionFindOrCreateResult>
  updateExecution(id: string, executionStatus: AiActionExecutionStatus): Promise<AiActionSummary>
  observeRepeat(draft: AiActionRepeatObservationDraft): Promise<void>
}
