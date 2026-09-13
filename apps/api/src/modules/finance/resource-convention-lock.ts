import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'

/** 先锁来源；依赖行使用 NOWAIT，避免与普通账款编辑的账款→发团→来源顺序互等。 */
export async function lockResourceConvention(
  tx: Prisma.TransactionClient,
  organizationId: string,
  source: { sourceType: string; sourceId: string },
): Promise<void> {
  let rows: Array<{ departureId: string }>
  if (source.sourceType === 'segment_resource') {
    rows = await tx.$queryRaw`
      SELECT segment.departure_id AS "departureId"
      FROM segment_resources resource
      JOIN itinerary_segments segment ON segment.id = resource.segment_id
      JOIN departures departure ON departure.id = segment.departure_id
      WHERE resource.id = ${source.sourceId} AND departure.organization_id = ${organizationId}
      FOR UPDATE OF resource
    `
  } else if (source.sourceType === 'departure_resource') {
    rows = await tx.$queryRaw`
      SELECT resource.departure_id AS "departureId"
      FROM departure_resources resource
      JOIN departures departure ON departure.id = resource.departure_id
      WHERE resource.id = ${source.sourceId} AND departure.organization_id = ${organizationId}
      FOR UPDATE OF resource
    `
  } else {
    throw new BadRequestException('仅资源可修改应付约定')
  }
  const departureId = rows[0]?.departureId
  if (!departureId) throw new NotFoundException('资源不存在')
  try {
    await tx.$queryRaw`
      SELECT id FROM payment_schedules
      WHERE organization_id = ${organizationId}
        AND source_type = ${source.sourceType} AND source_id = ${source.sourceId}
      ORDER BY id FOR UPDATE NOWAIT
    `
    await tx.$queryRaw`
      SELECT id FROM departures
      WHERE id = ${departureId} AND organization_id = ${organizationId}
      FOR UPDATE NOWAIT
    `
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2010' && error.meta?.code === '55P03') {
      throw new ConflictException('资源约定正在修改或结算，请稍后重试')
    }
    throw error
  }
}
