import type { Prisma } from '@prisma/client'
import { SOURCE_ORDER_REVIEW_PAYLOAD_SCHEMA, SEGMENT_RESOURCE_REVIEW_PAYLOAD_SCHEMA, DEPARTURE_RESOURCE_REVIEW_PAYLOAD_SCHEMA } from '@xiaotuanbao/ai-contracts'

export async function readInitialFinanceSources(
  tx: Pick<Prisma.TransactionClient, 'aiReviewRecord'>,
  organizationId: string,
  conversationId: string,
  departureId: string,
): Promise<Array<{ sourceType: 'source_order' | 'segment_resource' | 'departure_resource'; sourceId: string }>> {
  const records = await tx.aiReviewRecord.findMany({
    where: { organizationId, action: 'confirm', writeResult: 'success', package: {
      conversationId, targetKind: 'departure', targetId: departureId, status: 'confirmed',
      payloadSchema: { in: [SOURCE_ORDER_REVIEW_PAYLOAD_SCHEMA, SEGMENT_RESOURCE_REVIEW_PAYLOAD_SCHEMA, DEPARTURE_RESOURCE_REVIEW_PAYLOAD_SCHEMA] },
    } },
    select: { afterSnapshot: true, package: { select: { payloadSchema: true } } },
  })
  const found = new Map<string, { sourceType: 'source_order' | 'segment_resource' | 'departure_resource'; sourceId: string }>()
  for (const record of records) {
    const ref = record.afterSnapshot as { objectKind?: string; objectId?: string } | null
    const sourceType = record.package.payloadSchema === SOURCE_ORDER_REVIEW_PAYLOAD_SCHEMA ? 'source_order'
      : record.package.payloadSchema === SEGMENT_RESOURCE_REVIEW_PAYLOAD_SCHEMA ? 'segment_resource' : 'departure_resource'
    if (ref?.objectKind !== sourceType || typeof ref.objectId !== 'string' || !ref.objectId) continue
    found.set(`${sourceType}:${ref.objectId}`, { sourceType, sourceId: ref.objectId })
  }
  return [...found.values()]
}
