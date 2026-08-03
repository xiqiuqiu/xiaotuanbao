import { NotFoundException } from '@nestjs/common'
import {
  PaymentScheduleDirection,
  type FareAdjustmentDirection,
  type FareAdjustmentKind,
  type Partner,
  type PaymentSchedule,
  type Prisma,
  type SourceOrder,
} from '@prisma/client'
import { PaymentScheduleSourceType } from '@xiaotuanbao/shared'
import { PrismaService } from '../../database/prisma/prisma.service'

export type DbClient = PrismaService | Prisma.TransactionClient

export type SourceOrderWithRelations = SourceOrder & {
  partner: Partner
  departure: {
    id: string
    organizationId: string
    status: string
    startDate: Date
    endDate: Date
  }
  fareAdjustments?: Array<{
    id: string
    kind: FareAdjustmentKind
    direction: FareAdjustmentDirection
    amountCents: number
    customName: string | null
    sortOrder: number
  }>
  guests?: Array<{ id: string; name: string }>
}

export async function loadReceivableSchedules(
  client: DbClient,
  organizationId: string,
  sourceOrderId: string,
): Promise<PaymentSchedule[]> {
  return client.paymentSchedule.findMany({
    where: {
      organizationId,
      sourceId: sourceOrderId,
      direction: PaymentScheduleDirection.receivable,
    },
  })
}

export async function loadRebateSchedules(
  client: DbClient,
  organizationId: string,
  sourceOrderId: string,
): Promise<PaymentSchedule[]> {
  return client.paymentSchedule.findMany({
    where: {
      organizationId,
      sourceId: sourceOrderId,
      sourceType: PaymentScheduleSourceType.SOURCE_ORDER_REBATE,
      direction: PaymentScheduleDirection.payable,
    },
  })
}

export async function loadSourceOrderOrThrow(
  client: DbClient,
  organizationId: string,
  sourceOrderId: string,
): Promise<SourceOrderWithRelations> {
  const order = await client.sourceOrder.findFirst({
    where: {
      id: sourceOrderId,
      departure: { organizationId },
    },
    include: {
      partner: true,
      departure: {
        select: {
          id: true,
          organizationId: true,
          status: true,
          startDate: true,
          endDate: true,
        },
      },
      fareAdjustments: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
      guests: { orderBy: { createdAt: 'asc' }, select: { id: true, name: true } },
    },
  })

  if (!order) {
    throw new NotFoundException('客源单不存在')
  }

  return order
}
