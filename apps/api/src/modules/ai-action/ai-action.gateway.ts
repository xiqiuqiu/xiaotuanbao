import { createHash } from 'node:crypto'
import { Inject, Injectable } from '@nestjs/common'
import { AI_CREATE_TOOL_NAMES } from '@xiaotuanbao/ai-contracts'
import { AI_ACTION_STORE } from './ai-action.store'
import type {
  AiActionDecision,
  AiActionExecuteResult,
  AiActionKind,
  AiActionProposal,
  AiActionStore,
  AiActionSummary,
} from './ai-action.types'

const REGISTERED_ACTIONS: Record<
  (typeof AI_CREATE_TOOL_NAMES)[number],
  { kind: AiActionKind; decision: AiActionDecision; targetKind: string }
> = {
  getTaskContext: { kind: 'read', decision: 'allow', targetKind: 'ai_create_task' },
  searchRouteTemplates: { kind: 'read', decision: 'allow', targetKind: 'route_template_catalog' },
  getMaterialParseResult: { kind: 'read', decision: 'allow', targetKind: 'departure_material' },
  submitReviewPackage: { kind: 'write', decision: 'review', targetKind: 'departure_creation_draft' },
}

@Injectable()
export class AiActionGateway {
  constructor(@Inject(AI_ACTION_STORE) private readonly store: AiActionStore) {}

  async execute(proposal: AiActionProposal): Promise<AiActionExecuteResult> {
    const registered = isRegisteredName(proposal.name)
      ? REGISTERED_ACTIONS[proposal.name]
      : null

    const kind: AiActionKind = registered?.kind ?? 'write'
    const decision: AiActionDecision = registered ? registered.decision : 'deny'
    const reasonCode = registered ? 'OBSERVATION_PERIOD' : 'UNREGISTERED'
    const executionStatus = registered ? 'not_started' : 'skipped'

    const action = await this.persistDecision(proposal, {
      kind,
      decision,
      reasonCode,
      executionStatus,
      targetRef: registered
        ? {
            kind: registered.targetKind,
            id: resolveTargetId(registered.targetKind, proposal),
          }
        : null,
    })

    if (!registered) {
      return { action }
    }

    let result: unknown
    try {
      result = await proposal.forward({ action })
    } catch (error) {
      if (action) {
        try {
          await this.store.updateExecution(action.id, 'failed')
        } catch {
          // 执行失败仍抛出原错误；补结果失败不得改写失败原因
        }
      }
      throw error
    }

    if (!action) {
      return { action: null, result }
    }

    const completed = await this.store.updateExecution(action.id, 'succeeded')
    return { action: completed, result }
  }

  private async persistDecision(
    proposal: AiActionProposal,
    fields: {
      kind: AiActionKind
      decision: AiActionDecision
      reasonCode: string
      executionStatus: 'not_started' | 'skipped'
      targetRef: AiActionSummary['targetRef']
    },
  ): Promise<AiActionSummary | null> {
    try {
      return await this.store.create({
        ...proposal.actor,
        name: proposal.name,
        kind: fields.kind,
        decision: fields.decision,
        reasonCode: fields.reasonCode,
        targetRef: fields.targetRef,
        inputHash: hashInput(proposal.input),
        candidateFieldKeys: extractCandidateFieldKeys(proposal.input),
        executionStatus: fields.executionStatus,
      })
    } catch (error) {
      if (fields.kind === 'read') {
        return null
      }
      throw error
    }
  }
}

function isRegisteredName(name: string): name is (typeof AI_CREATE_TOOL_NAMES)[number] {
  return Object.hasOwn(REGISTERED_ACTIONS, name)
}

function resolveTargetId(targetKind: string, proposal: AiActionProposal): string | null {
  if (targetKind === 'route_template_catalog') {
    return proposal.actor.organizationId
  }
  if (targetKind === 'departure_material') {
    if (proposal.input && typeof proposal.input === 'object' && 'materialId' in proposal.input) {
      const materialId = (proposal.input as { materialId: unknown }).materialId
      return typeof materialId === 'string' && materialId.length > 0 ? materialId : null
    }
    return null
  }
  return proposal.actor.taskId ?? null
}

function hashInput(input: unknown): string {
  return createHash('sha256').update(JSON.stringify(input) ?? 'null').digest('hex')
}

function extractCandidateFieldKeys(input: unknown): string[] {
  if (!input || typeof input !== 'object' || !('candidates' in input)) {
    return []
  }
  const candidates = (input as { candidates: unknown }).candidates
  if (!Array.isArray(candidates)) {
    return []
  }
  return candidates.flatMap((candidate) => {
    if (
      candidate &&
      typeof candidate === 'object' &&
      'fieldKey' in candidate &&
      typeof candidate.fieldKey === 'string' &&
      candidate.fieldKey.length > 0
    ) {
      return [candidate.fieldKey]
    }
    return []
  })
}
