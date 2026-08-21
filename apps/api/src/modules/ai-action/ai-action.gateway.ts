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
    const targetMismatch = Boolean(registered) && isClaimedTargetMismatch(proposal)

    const kind: AiActionKind = registered?.kind ?? 'write'
    const decision: AiActionDecision = registered && !targetMismatch ? registered.decision : 'deny'
    const reasonCode = !registered ? 'UNREGISTERED' : targetMismatch ? 'TARGET_MISMATCH' : 'OBSERVATION_PERIOD'
    const executionStatus = decision === 'deny' ? 'skipped' : 'not_started'

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

    if (decision === 'deny') {
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

function claimedStringField(input: unknown, field: string): string | null {
  if (!input || typeof input !== 'object' || !(field in input)) {
    return null
  }
  const value = (input as Record<string, unknown>)[field]
  return typeof value === 'string' && value.length > 0 ? value : null
}

function isClaimedTargetMismatch(proposal: AiActionProposal): boolean {
  if (
    proposal.name !== 'getTaskContext' &&
    proposal.name !== 'getMaterialParseResult' &&
    proposal.name !== 'searchRouteTemplates'
  ) {
    return false
  }
  const claimedTaskId = claimedStringField(proposal.input, 'taskId')
  if (claimedTaskId !== null && claimedTaskId !== (proposal.actor.taskId ?? null)) {
    return true
  }
  if (proposal.name !== 'searchRouteTemplates') {
    return false
  }
  const claimedOrgId = claimedStringField(proposal.input, 'organizationId')
  return claimedOrgId !== null && claimedOrgId !== proposal.actor.organizationId
}

function resolveTargetId(targetKind: string, proposal: AiActionProposal): string | null {
  if (targetKind === 'route_template_catalog') {
    return proposal.actor.organizationId
  }
  if (targetKind === 'departure_material') {
    return claimedStringField(proposal.input, 'materialId')
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
