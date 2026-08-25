import type { Prisma } from '@prisma/client'
import { materialParsePageSchemaV1 } from '@xiaotuanbao/ai-contracts'
import { parseEventSequences } from './ai-context-manifest'
import type { EvidenceAuthority } from './evidence-validator'

type EvidenceClient = {
  aiAgentAttempt: Prisma.TransactionClient['aiAgentAttempt']
  aiContextManifest: Prisma.TransactionClient['aiContextManifest']
  aiConversationEvent: Prisma.TransactionClient['aiConversationEvent']
  conversationSourceParseRun: Prisma.TransactionClient['conversationSourceParseRun']
}

export async function loadEvidenceAuthority(
  client: EvidenceClient,
  caller: {
    organizationId: string
    conversationId: string
    inputBatchId: string
    attemptId: string
    contextManifestId?: string
  },
): Promise<EvidenceAuthority | null> {
  const attempt = await client.aiAgentAttempt.findUnique({
    where: { id: caller.attemptId },
    select: {
      id: true,
      contextManifestId: true,
      conversationId: true,
      inputBatchId: true,
      organizationId: true,
    },
  })
  if (
    !attempt ||
    attempt.organizationId !== caller.organizationId ||
    attempt.conversationId !== caller.conversationId ||
    attempt.inputBatchId !== caller.inputBatchId
  ) {
    return null
  }
  if (caller.contextManifestId && attempt.contextManifestId !== caller.contextManifestId) {
    return null
  }
  const manifest = await client.aiContextManifest.findUnique({
    where: { id: attempt.contextManifestId },
  })
  if (!manifest) {
    return null
  }
  const eventSequences = parseEventSequences(manifest.eventSequences)
  const events = await client.aiConversationEvent.findMany({
    where: {
      conversationId: manifest.conversationId,
      sequence: { in: eventSequences },
      kind: 'user_message',
    },
    select: { id: true, conversationId: true, sequence: true, kind: true, payload: true },
  })
  const materialVersions = Array.isArray(manifest.materialVersions)
    ? (manifest.materialVersions as Array<{ materialId: string; parseResultVersion: number }>)
    : []
  const excerptDigests = Array.isArray(manifest.excerptDigests)
    ? (manifest.excerptDigests as EvidenceAuthority['contextManifest']['excerptDigests'])
    : []
  const runs =
    materialVersions.length === 0
      ? []
      : await client.conversationSourceParseRun.findMany({
          where: {
            OR: materialVersions.map((item) => ({
              sourceId: item.materialId,
              resultVersion: item.parseResultVersion,
            })),
          },
          select: { sourceId: true, resultVersion: true, pages: true },
        })
  const materials: EvidenceAuthority['materials'] = materialVersions.flatMap((item) => {
    const run = runs.find(
      (candidate) =>
        candidate.sourceId === item.materialId && candidate.resultVersion === item.parseResultVersion,
    )
    const pages = Array.isArray(run?.pages)
      ? run.pages.flatMap((page) => {
          const parsed = materialParsePageSchemaV1.safeParse(page)
          return parsed.success ? [parsed.data] : []
        })
      : []
    return [
      {
        inputBatchId: manifest.inputBatchId,
        materialId: item.materialId,
        parseResultVersion: item.parseResultVersion,
        pages,
        eligibleRegions: excerptDigests
          .filter(
            (digest) =>
              digest.materialId === item.materialId &&
              digest.parseResultVersion === item.parseResultVersion,
          )
          .map((digest) => ({
            pageNumber: digest.pageNumber,
            normalizedTextRange: digest.normalizedTextRange,
            contentSha256: digest.sha256,
            source: {
              kind: 'initial_manifest_excerpt' as const,
              fragmentId: digest.fragmentId,
            },
          })),
      },
    ]
  })
  return {
    attempt: { id: attempt.id, contextManifestId: attempt.contextManifestId },
    contextManifest: {
      id: manifest.id,
      conversationId: manifest.conversationId,
      inputBatchId: manifest.inputBatchId,
      eventSequences,
      materialVersions,
      excerptDigests,
    },
    events: events.flatMap((event) => {
      const payload = event.payload
      const text =
        payload && typeof payload === 'object' && !Array.isArray(payload) && 'text' in payload
          ? String((payload as { text: unknown }).text ?? '')
          : ''
      return [
        {
          id: event.id,
          conversationId: event.conversationId,
          sequence: event.sequence,
          kind: 'user_message' as const,
          text,
        },
      ]
    }),
    materials,
  }
}
