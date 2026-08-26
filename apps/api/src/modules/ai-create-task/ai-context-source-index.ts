import {
  OVERSIZED_INPUT_CHUNKED_TRUNCATION,
  buildSourceIndex,
  renderSourceIndexProjection,
  type SourceIndexOrigin,
  type SourceIndexRecord,
} from '@xiaotuanbao/ai-contracts'
import type { Prisma } from '@prisma/client'
import { CONTEXT_PREPARE_FAILED, type CompactionPlan } from './ai-context-compaction'
import type { FrozenContextProjection } from './ai-context-manifest'

export type SourceIndexPersistClient = {
  aiSourceIndexVersion: Prisma.TransactionClient['aiSourceIndexVersion']
}

export type ResolvedModelCurrentInput = {
  currentUserText: string
  sourceIndexVersion: number | null
  record: SourceIndexRecord | null
  truncationReasons: string[]
}

export function userMessageSourceOrigin(
  conversationId: string,
  event: { id: string; sequence: number },
): SourceIndexOrigin {
  return {
    kind: 'user_message',
    conversationId,
    eventId: event.id,
    sequence: event.sequence,
  }
}

export function withSourceIndexTruncation(
  projection: FrozenContextProjection,
  extra: readonly string[],
): FrozenContextProjection {
  if (extra.length === 0) {
    return projection
  }
  return {
    ...projection,
    truncationReasons: [...projection.truncationReasons, ...extra],
  }
}

export async function resolveModelCurrentInput(
  prisma: SourceIndexPersistClient,
  input: {
    organizationId: string
    conversationId: string
    inputBatchId: string
    origin: SourceIndexOrigin
    originalText: string
    plan: CompactionPlan
  },
): Promise<ResolvedModelCurrentInput> {
  if (!input.plan.currentInputOverflow) {
    return {
      currentUserText: input.originalText,
      sourceIndexVersion: null,
      record: null,
      truncationReasons: [],
    }
  }
  const record = buildSourceIndex(input.origin, input.originalText)
  try {
    const persisted = await persistCompletedSourceIndexVersion(prisma, {
      organizationId: input.organizationId,
      conversationId: input.conversationId,
      inputBatchId: input.inputBatchId,
      origin: input.origin,
      record,
    })
    return {
      currentUserText: renderSourceIndexProjection(record),
      sourceIndexVersion: persisted.version,
      record,
      truncationReasons: [OVERSIZED_INPUT_CHUNKED_TRUNCATION],
    }
  } catch {
    throw new Error(CONTEXT_PREPARE_FAILED)
  }
}

export async function persistCompletedSourceIndexVersion(
  tx: SourceIndexPersistClient,
  input: {
    organizationId: string
    conversationId: string
    inputBatchId: string
    origin: SourceIndexOrigin
    record: SourceIndexRecord
  },
): Promise<{ version: number }> {
  const existing = await tx.aiSourceIndexVersion.findFirst({
    where: {
      conversationId: input.conversationId,
      inputDigest: input.record.inputDigest,
      policyVersion: input.record.policyVersion,
    },
    select: { id: true, version: true, status: true },
  })
  if (existing?.status === 'completed') {
    return { version: existing.version }
  }
  const version =
    existing?.version ??
    ((
      await tx.aiSourceIndexVersion.aggregate({
        where: { conversationId: input.conversationId },
        _max: { version: true },
      })
    )._max.version ?? 0) + 1
  const originEventId = input.origin.kind === 'user_message' ? input.origin.eventId : null
  const originSourceId = input.origin.kind === 'conversation_source' ? input.origin.sourceId : null
  const originParseVersion =
    input.origin.kind === 'conversation_source' ? input.origin.parseVersion : null
  const data = {
    organizationId: input.organizationId,
    conversationId: input.conversationId,
    inputBatchId: input.inputBatchId,
    originKind: input.origin.kind,
    originEventId,
    originSourceId,
    originParseVersion,
    version,
    status: 'completed' as const,
    policyVersion: input.record.policyVersion,
    configVersion: input.record.configVersion,
    extractSchemaVersion: input.record.extractSchemaVersion,
    chunkCount: input.record.chunkCount,
    chunks: JSON.parse(
      JSON.stringify(
        input.record.locators.map((locator) => ({
          chunkIndex: locator.chunkIndex,
          status: input.record.failedChunkIndexes.includes(locator.chunkIndex)
            ? 'failed'
            : 'completed',
          locator,
        })),
      ),
    ) as Prisma.InputJsonValue,
    indexJson: JSON.parse(JSON.stringify(input.record)) as Prisma.InputJsonValue,
    digest: input.record.digest,
    inputDigest: input.record.inputDigest,
  }
  if (existing) {
    await tx.aiSourceIndexVersion.update({
      where: { id: existing.id },
      data,
    })
    return { version }
  }
  try {
    await tx.aiSourceIndexVersion.create({ data })
    return { version }
  } catch (error) {
    const raced = await tx.aiSourceIndexVersion.findFirst({
      where: {
        conversationId: input.conversationId,
        inputDigest: input.record.inputDigest,
        policyVersion: input.record.policyVersion,
      },
      select: { version: true, status: true },
    })
    if (raced?.status === 'completed') {
      return { version: raced.version }
    }
    throw error
  }
}
