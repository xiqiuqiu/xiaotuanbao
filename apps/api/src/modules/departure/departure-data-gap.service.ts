import { Injectable } from '@nestjs/common'
import type {
  DepartureDataGap,
  DepartureDataGapCode,
} from '@xiaotuanbao/shared'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../database/prisma/prisma.service'

const DATA_GAP_LABELS: Record<DepartureDataGapCode, string> = {
  no_source_orders: '无客源单',
  no_itinerary_segments: '无行程段',
  no_segment_resources: '无行程资源',
  incomplete_guest_roster: '客人名单待补充',
}

interface DepartureDataGapRow {
  id: string
  noSourceOrders: boolean
  noItinerarySegments: boolean
  noSegmentResources: boolean
  incompleteGuestRoster: boolean
}

function toDataGaps(row: DepartureDataGapRow): DepartureDataGap[] {
  const codes: DepartureDataGapCode[] = []
  if (row.noSourceOrders) codes.push('no_source_orders')
  if (row.noItinerarySegments) codes.push('no_itinerary_segments')
  if (row.noSegmentResources) codes.push('no_segment_resources')
  if (row.incompleteGuestRoster) codes.push('incomplete_guest_roster')
  return codes.map((code) => ({ code, label: DATA_GAP_LABELS[code] }))
}

@Injectable()
export class DepartureDataGapService {
  constructor(private readonly prisma: PrismaService) {}

  async findByOrganization(organizationId: string): Promise<Map<string, DepartureDataGap[]>> {
    const rows = await this.prisma.$queryRaw<DepartureDataGapRow[]>(Prisma.sql`
      SELECT
        d.id,
        NOT EXISTS (
          SELECT 1 FROM source_orders so WHERE so.departure_id = d.id
        ) AS "noSourceOrders",
        NOT EXISTS (
          SELECT 1 FROM itinerary_segments segment WHERE segment.departure_id = d.id
        ) AS "noItinerarySegments",
        (
          EXISTS (
            SELECT 1 FROM itinerary_segments segment WHERE segment.departure_id = d.id
          )
          AND NOT EXISTS (
            SELECT 1
            FROM segment_resources resource
            JOIN itinerary_segments segment ON segment.id = resource.segment_id
            WHERE segment.departure_id = d.id
          )
        ) AS "noSegmentResources",
        EXISTS (
          SELECT 1
          FROM source_orders so
          WHERE so.departure_id = d.id
            AND (
              SELECT COUNT(*)::int
              FROM source_order_guests guest
              WHERE guest.source_order_id = so.id
            ) < so.guest_count
        ) AS "incompleteGuestRoster"
      FROM departures d
      WHERE d.organization_id = ${organizationId}
    `)

    return new Map(rows.map((row) => [row.id, toDataGaps(row)]))
  }
}
