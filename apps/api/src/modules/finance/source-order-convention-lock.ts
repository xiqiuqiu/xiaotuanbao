import { ConflictException, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PaymentScheduleSourceType, SOURCE_ORDER_RECEIVABLE_SOURCE_TYPES } from '@xiaotuanbao/shared'

/** 与生成应收共用来源锁；依赖行 NOWAIT 避免与账款编辑的反向锁序互等。 */
export async function lockSourceOrderConvention(
  tx: Prisma.TransactionClient,
  organizationId: string,
  sourceOrderId: string,
): Promise<void> {
  const rows = await tx.$queryRaw<Array<{ departureId: string }>>`
    SELECT source.departure_id AS "departureId"
    FROM source_orders source
    JOIN departures departure ON departure.id = source.departure_id
    WHERE source.id = ${sourceOrderId} AND departure.organization_id = ${organizationId}
    FOR UPDATE OF source
  `
  const departureId = rows[0]?.departureId
  if (!departureId) throw new NotFoundException('客源单不存在')
  try {
    await tx.$queryRaw`
      SELECT id FROM payment_schedules
      WHERE organization_id = ${organizationId} AND source_id = ${sourceOrderId}
        AND source_type IN (${Prisma.join([...SOURCE_ORDER_RECEIVABLE_SOURCE_TYPES, PaymentScheduleSourceType.SOURCE_ORDER_REBATE])})
      ORDER BY id FOR UPDATE NOWAIT
    `
    await tx.$queryRaw`
      SELECT id FROM departures
      WHERE id = ${departureId} AND organization_id = ${organizationId}
      FOR UPDATE NOWAIT
    `
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2010' && error.meta?.code === '55P03') {
      throw new ConflictException('客源约定正在修改或结算，请稍后重试')
    }
    throw error
  }
}
