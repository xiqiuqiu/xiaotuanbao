import { createHash } from 'node:crypto'
import type { Prisma } from '@prisma/client'

/** Opaque fingerprint of collaboration facts, not a timestamp or monotonic revision.
 * One SQL statement keeps all dependent rows on the same PostgreSQL snapshot.
 * Financial review packages retain their narrower convention checks at write time.
 */
export async function departureObjectVersion(
  tx: Prisma.TransactionClient,
  organizationId: string,
  departureId: string,
): Promise<number> {
  const [row] = await tx.$queryRaw<{ snapshot: string }[]>`
    SELECT jsonb_build_object(
      'departure', to_jsonb(d) - 'created_at' - 'updated_at',
      'sourceOrders', (SELECT jsonb_agg(to_jsonb(s) - 'created_at' - 'updated_at' ORDER BY s.id)
        FROM source_orders s WHERE s.departure_id = d.id),
      'guests', (SELECT jsonb_agg(to_jsonb(g) - 'created_at' - 'updated_at' ORDER BY g.id)
        FROM source_order_guests g JOIN source_orders s ON s.id = g.source_order_id WHERE s.departure_id = d.id),
      'fareAdjustments', (SELECT jsonb_agg(to_jsonb(a) - 'created_at' - 'updated_at' ORDER BY a.id)
        FROM source_order_fare_adjustments a JOIN source_orders s ON s.id = a.source_order_id WHERE s.departure_id = d.id),
      'segments', (SELECT jsonb_agg(to_jsonb(s) ORDER BY s.id)
        FROM itinerary_segments s WHERE s.departure_id = d.id),
      'segmentResources', (SELECT jsonb_agg(to_jsonb(r) - 'created_at' - 'updated_at' ORDER BY r.id)
        FROM segment_resources r JOIN itinerary_segments s ON s.id = r.segment_id WHERE s.departure_id = d.id),
      'departureResources', (SELECT jsonb_agg(to_jsonb(r) - 'created_at' - 'updated_at' ORDER BY r.id)
        FROM departure_resources r WHERE r.departure_id = d.id),
      'partnerNames', (SELECT jsonb_agg(jsonb_build_array(p.id, p.name) ORDER BY p.id)
        FROM partners p WHERE p.id IN (SELECT s.partner_id FROM source_orders s WHERE s.departure_id = d.id))
    )::text AS snapshot FROM departures d WHERE d.id = ${departureId} AND d.organization_id = ${organizationId}
  `
  if (!row) throw new Error('REVIEW_PACKAGE_TASK_MISSING')
  // ponytail: 52-bit numeric API token has a negligible hash-collision risk; use a full digest if the API moves to strings.
  return Number.parseInt(createHash('sha256').update(row.snapshot).digest('hex').slice(0, 13), 16) + 1
}
