import type {
  AiConversationEventView,
  AiConversationDraftView,
  AiConversationInteractionView,
  AiConversationView,
  AiInputBatchMaterialView,
  AiInputBatchView,
} from '@xiaotuanbao/shared'
import {
  DepartureMaterialStatus,
  type AiConversation,
  type AiConversationEvent,
  type AiConversationDraft,
  type AiConversationInteraction,
  type AiInputBatch,
} from '@prisma/client'
import { materialProgressFromDeps, parseErrorMessage } from './departure-material.constants'

export type BatchMaterialSource = {
  materialId: string
  required: boolean
  parseResultVersion: number | null
  material?: {
    originalFilename: string
    status: DepartureMaterialStatus
    parseRuns?: Array<{
      errorCode: string | null
      status: string
    }>
  }
}

export function toEventView(event: AiConversationEvent): AiConversationEventView {
  return {
    id: event.id,
    sequence: event.sequence,
    kind: event.kind,
    payload: asRecord(event.payload),
    createdAt: event.createdAt.toISOString(),
  }
}

export function toInteractionView(
  interaction: AiConversationInteraction,
): AiConversationInteractionView {
  return {
    id: interaction.id,
    eventId: interaction.eventId,
    type: interaction.type,
    prompt: interaction.prompt,
    options: parseInteractionOptions(interaction.options),
    responseSchema: asRecord(interaction.responseSchema),
    status: interaction.status,
    version: interaction.version,
  }
}

export function parseInteractionOptions(value: unknown): Array<{ id: string; label: string }> {
  if (!Array.isArray(value)) {
    return []
  }
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') {
      return []
    }
    const record = item as Record<string, unknown>
    if (typeof record.id !== 'string' || typeof record.label !== 'string') {
      return []
    }
    return [{ id: record.id, label: record.label }]
  })
}

export function toBatchMaterialView(dep: BatchMaterialSource): AiInputBatchMaterialView {
  const failed = isFailedDependency(dep)
  const errorCode = failed ? latestErrorCode(dep) : null
  return {
    materialId: dep.materialId,
    originalFilename: dep.material?.originalFilename ?? '',
    required: dep.required,
    parseResultVersion: dep.parseResultVersion,
    status: dep.parseResultVersion != null ? 'ready' : failed ? 'failed' : 'pending',
    errorCode,
    errorMessage: errorCode ? parseErrorMessage(errorCode) : null,
  }
}

export function toBatchView(
  batch: AiInputBatch & {
    materials?: BatchMaterialSource[]
  },
  options?: { queued?: boolean },
): AiInputBatchView {
  const materials = batch.materials?.map(toBatchMaterialView)
  const materialProgress = batch.materials
    ? materialProgressFromDeps(
        batch.materials.map((item) => ({
          required: item.required,
          parseResultVersion: item.parseResultVersion,
          failed: isFailedDependency(item),
        })),
      )
    : undefined
  return {
    id: batch.id,
    status: batch.status,
    conversationVersion: batch.conversationVersion,
    replyToEventId: batch.replyToEventId,
    ...(options?.queued ? { queued: true } : {}),
    ...(materialProgress && materialProgress.total > 0 ? { materialProgress } : {}),
    ...(materials && materials.length > 0 ? { materials } : {}),
  }
}

export function toConversationView(
  conversation: AiConversation,
  events: AiConversationEvent[],
  activeBatch: (AiInputBatch & { materials?: BatchMaterialSource[] }) | null,
  pendingInteraction: AiConversationInteraction | null = null,
  queuedBatches: Array<AiInputBatch & { materials?: BatchMaterialSource[] }> = [],
  draft: AiConversationDraft | null = null,
): AiConversationView {
  return {
    id: conversation.id,
    status: conversation.status,
    events: events.map(toEventView),
    activeBatch: activeBatch ? toBatchView(activeBatch) : null,
    pendingInteraction: pendingInteraction ? toInteractionView(pendingInteraction) : null,
    queuedBatches: queuedBatches.map((batch) => toBatchView(batch, { queued: true })),
    draft: toConversationDraftView(conversation.id, draft),
  }
}

export function toConversationDraftView(
  conversationId: string,
  draft: AiConversationDraft | null,
): AiConversationDraftView {
  return {
    conversationId,
    text: draft?.text ?? '',
    draftEpoch: draft?.draftEpoch ?? 0,
    revision: draft?.revision ?? 0,
    updatedAt: (draft?.updatedAt ?? new Date(0)).toISOString(),
  }
}

export function toFailedMaterialPayload(deps: BatchMaterialSource[]) {
  return deps.filter(isFailedDependency).map((item) => {
    const view = toBatchMaterialView(item)
    return {
      materialId: view.materialId,
      originalFilename: view.originalFilename,
      errorCode: view.errorCode,
      errorMessage: view.errorMessage,
    }
  })
}

export function isFailedDependency(dep: BatchMaterialSource): boolean {
  return dep.parseResultVersion == null && dep.material?.status === DepartureMaterialStatus.failed
}

function latestErrorCode(dep: BatchMaterialSource): string | null {
  return dep.material?.parseRuns?.[0]?.errorCode ?? 'PARSE_FAILED'
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}
