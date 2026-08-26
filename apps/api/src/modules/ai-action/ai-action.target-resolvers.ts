import type { AiActionActor } from './ai-action.types'
import type {
  AiActionTargetAuthority,
  AiActionTargetResolveResult,
} from './ai-action.target'
import {
  claimedIdentityMismatch,
  claimedPositiveIntField,
  claimedStringField,
} from './ai-action.target'

export async function resolveRegisteredTarget(
  name: string,
  actor: AiActionActor,
  input: unknown,
  authority: AiActionTargetAuthority,
): Promise<AiActionTargetResolveResult> {
  const resolver = TARGET_RESOLVERS[name]
  if (!resolver) {
    return {
      ok: false,
      reasonCode: 'TARGET_MISSING',
      targetRef: { kind: 'unknown', id: null },
    }
  }
  return resolver(actor, input, authority)
}

type TargetResolver = (
  actor: AiActionActor,
  input: unknown,
  authority: AiActionTargetAuthority,
) => Promise<AiActionTargetResolveResult>

const TARGET_RESOLVERS: Record<string, TargetResolver> = {
  getTaskContext: resolveTaskContext,
  searchRouteTemplates: resolveRouteCatalog,
  proposeReviewPackage: resolveDepartureDraft,
  getMaterialParseResult: resolvePinnedMaterial,
  replyPlaintext: resolveConversation,
}

async function resolveTaskContext(
  actor: AiActionActor,
  input: unknown,
  authority: AiActionTargetAuthority,
): Promise<AiActionTargetResolveResult> {
  const mismatch = denyClaimedMismatch(actor, input, { kind: 'ai_create_task', id: actor.taskId ?? null })
  if (mismatch) {
    return mismatch
  }
  if (!actor.taskId) {
    return deny('TARGET_MISSING', { kind: 'ai_create_task', id: null })
  }
  const task = await authority.findTask(actor.taskId)
  return taskScope(actor, task, { kind: 'ai_create_task', id: actor.taskId })
}

async function resolveRouteCatalog(
  actor: AiActionActor,
  input: unknown,
): Promise<AiActionTargetResolveResult> {
  const targetRef = {
    kind: 'route_template_catalog',
    id: actor.organizationId,
  }
  const mismatch = denyClaimedMismatch(actor, input, targetRef)
  if (mismatch) {
    return mismatch
  }
  const claimedOrgId = claimedStringField(input, 'organizationId')
  if (claimedOrgId !== null && claimedOrgId !== actor.organizationId) {
    return deny('TARGET_MISMATCH', targetRef)
  }
  return {
    ok: true,
    target: {
      kind: 'route_template_catalog',
      id: actor.organizationId,
      organizationId: actor.organizationId,
      version: null,
    },
  }
}

async function resolveDepartureDraft(
  actor: AiActionActor,
  input: unknown,
  authority: AiActionTargetAuthority,
): Promise<AiActionTargetResolveResult> {
  if (!actor.taskId) {
    return deny('TARGET_MISSING', { kind: 'departure_creation_draft', id: null })
  }
  const task = await authority.findTask(actor.taskId)
  const targetRef = {
    kind: 'departure_creation_draft',
    id: task?.draftId ?? actor.taskId,
  }
  const mismatch = denyClaimedMismatch(actor, input, targetRef)
  if (mismatch) {
    return mismatch
  }
  const scoped = taskScope(actor, task, targetRef)
  if (!scoped.ok) {
    return scoped
  }
  if (!task?.draftId || task.draftVersion == null) {
    return deny('TARGET_MISSING', targetRef)
  }
  const claimedVersion = claimedPositiveIntField(input, 'objectVersion')
  if (claimedVersion === null || claimedVersion !== task.draftVersion) {
    return deny('TARGET_VERSION_MISMATCH', { kind: 'departure_creation_draft', id: task.draftId })
  }
  return {
    ok: true,
    target: {
      kind: 'departure_creation_draft',
      id: task.draftId,
      organizationId: task.organizationId,
      version: task.draftVersion,
    },
  }
}

async function resolvePinnedMaterial(
  actor: AiActionActor,
  input: unknown,
  authority: AiActionTargetAuthority,
): Promise<AiActionTargetResolveResult> {
  const materialId = claimedStringField(input, 'materialId')
  const mismatch = denyClaimedMismatch(actor, input, {
    kind: 'departure_material',
    id: materialId,
  })
  if (mismatch) {
    return mismatch
  }
  if (!materialId) {
    return deny('TARGET_MISSING', { kind: 'departure_material', id: null })
  }
  const claimedVersion = claimedPositiveIntField(input, 'parseResultVersion')
  if (claimedVersion === null) {
    return deny('TARGET_VERSION_MISMATCH', { kind: 'departure_material', id: materialId })
  }
  if (!actor.inputBatchId) {
    return deny('TARGET_NOT_PINNED', { kind: 'departure_material', id: materialId })
  }

  const pin = await authority.findPinnedMaterial({
    inputBatchId: actor.inputBatchId,
    materialId,
  })
  if (pin) {
    if (pin.organizationId !== actor.organizationId) {
      return deny('CROSS_ORGANIZATION', { kind: 'departure_material', id: materialId })
    }
    if (pin.parseResultVersion == null) {
      return deny('TARGET_NOT_PINNED', { kind: 'departure_material', id: materialId })
    }
    if (pin.parseResultVersion !== claimedVersion) {
      return deny('TARGET_VERSION_MISMATCH', { kind: 'departure_material', id: materialId })
    }
    return {
      ok: true,
      target: {
        kind: 'departure_material',
        id: materialId,
        organizationId: pin.organizationId,
        version: pin.parseResultVersion,
      },
    }
  }

  const material = await authority.findMaterial(materialId)
  if (!material) {
    return deny('TARGET_MISSING', { kind: 'departure_material', id: materialId })
  }
  if (material.organizationId !== actor.organizationId) {
    return deny('CROSS_ORGANIZATION', { kind: 'departure_material', id: materialId })
  }
  return deny('TARGET_NOT_PINNED', { kind: 'departure_material', id: materialId })
}

async function resolveConversation(
  actor: AiActionActor,
  input: unknown,
  authority: AiActionTargetAuthority,
): Promise<AiActionTargetResolveResult> {
  const mismatch = denyClaimedMismatch(actor, input, {
    kind: 'agent_conversation',
    id: actor.conversationId ?? null,
  })
  if (mismatch) {
    return mismatch
  }
  if (!actor.conversationId) {
    return deny('TARGET_MISSING', { kind: 'agent_conversation', id: null })
  }
  const conversation = await authority.findConversation(actor.conversationId)
  if (!conversation) {
    return deny('TARGET_MISSING', { kind: 'agent_conversation', id: actor.conversationId })
  }
  if (conversation.organizationId !== actor.organizationId) {
    return deny('CROSS_ORGANIZATION', { kind: 'agent_conversation', id: actor.conversationId })
  }
  if (actor.userId && conversation.creatorUserId !== actor.userId) {
    return deny('OBJECT_SCOPE_DENIED', { kind: 'agent_conversation', id: actor.conversationId })
  }
  return {
    ok: true,
    target: {
      kind: 'agent_conversation',
      id: conversation.id,
      organizationId: conversation.organizationId,
      version: null,
    },
  }
}

function taskScope(
  actor: AiActionActor,
  task: Awaited<ReturnType<AiActionTargetAuthority['findTask']>>,
  targetRef: { kind: string; id: string | null },
): AiActionTargetResolveResult {
  if (!task) {
    return deny('TARGET_MISSING', targetRef)
  }
  if (task.organizationId !== actor.organizationId) {
    return deny('CROSS_ORGANIZATION', targetRef)
  }
  if (actor.userId && task.ownerUserId !== actor.userId) {
    return deny('OBJECT_SCOPE_DENIED', { ...targetRef, id: task.draftId ?? task.id })
  }
  return {
    ok: true,
    target: {
      kind: targetRef.kind,
      id: targetRef.id ?? task.id,
      organizationId: task.organizationId,
      version: task.draftVersion,
    },
  }
}

function denyClaimedMismatch(
  actor: AiActionActor,
  input: unknown,
  targetRef: { kind: string; id: string | null },
): AiActionTargetResolveResult | null {
  return claimedIdentityMismatch(actor, input) ? deny('TARGET_MISMATCH', targetRef) : null
}

function deny(reasonCode: string, targetRef: { kind: string; id: string | null }): AiActionTargetResolveResult {
  return { ok: false, reasonCode, targetRef }
}
