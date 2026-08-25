import type { AiActionActor, AiActionNormalizedTarget } from './ai-action.types'

export const AI_ACTION_TARGET_AUTHORITY = Symbol('AI_ACTION_TARGET_AUTHORITY')

export type AiActionTaskFact = {
  id: string
  organizationId: string
  ownerUserId: string
  draftId: string | null
  draftVersion: number | null
}

export type AiActionMaterialFact = {
  id: string
  organizationId: string
}

export type AiActionMaterialPinFact = {
  materialId: string
  organizationId: string
  parseResultVersion: number | null
}

export type AiActionConversationFact = {
  id: string
  organizationId: string
  creatorUserId: string
}

export type AiActionTargetResolveOk = {
  ok: true
  target: AiActionNormalizedTarget
}

export type AiActionTargetResolveDeny = {
  ok: false
  reasonCode: string
  targetRef: { kind: string; id: string | null }
}

export type AiActionTargetResolveResult = AiActionTargetResolveOk | AiActionTargetResolveDeny

export interface AiActionTargetAuthority {
  findTask(taskId: string): Promise<AiActionTaskFact | null>
  findMaterial(materialId: string): Promise<AiActionMaterialFact | null>
  findPinnedMaterial(params: {
    inputBatchId: string
    materialId: string
  }): Promise<AiActionMaterialPinFact | null>
  findConversation(conversationId: string): Promise<AiActionConversationFact | null>
}

export function claimedStringField(input: unknown, field: string): string | null {
  if (!input || typeof input !== 'object' || !(field in input)) {
    return null
  }
  const value = (input as Record<string, unknown>)[field]
  return typeof value === 'string' && value.length > 0 ? value : null
}

export function claimedPositiveIntField(input: unknown, field: string): number | null {
  if (!input || typeof input !== 'object' || !(field in input)) {
    return null
  }
  const value = (input as Record<string, unknown>)[field]
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null
}

export function claimedIdentityMismatch(
  actor: AiActionActor,
  input: unknown,
): 'task' | 'organization' | 'conversation' | null {
  const claimedTaskId = claimedStringField(input, 'taskId')
  if (claimedTaskId !== null && claimedTaskId !== (actor.taskId ?? null)) {
    return 'task'
  }
  const claimedOrgId = claimedStringField(input, 'organizationId')
  if (claimedOrgId !== null && claimedOrgId !== actor.organizationId) {
    return 'organization'
  }
  const claimedConversationId = claimedStringField(input, 'conversationId')
  if (claimedConversationId !== null && claimedConversationId !== (actor.conversationId ?? null)) {
    return 'conversation'
  }
  return null
}
