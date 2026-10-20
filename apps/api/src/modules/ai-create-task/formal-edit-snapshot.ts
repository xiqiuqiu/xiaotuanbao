import { BadRequestException, ConflictException } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { ITINERARY_SEGMENT_UPDATE_CONFIRMATION_UNIT, sourceOrderGuestChangesSchema } from '@xiaotuanbao/ai-contracts'
import { formatDateOnly } from '../departure/departure-date.utils'

export async function readItinerarySegmentEditSnapshot(
  tx: Prisma.TransactionClient,
  organizationId: string,
  departureId: string,
  itinerarySegmentId: string,
) {
  const segment = await tx.itinerarySegment.findFirst({
    where: { id: itinerarySegmentId, departureId, departure: { organizationId } },
  })
  if (!segment) throw new ConflictException('行程不存在或不属于当前发团')
  return {
    itinerarySegmentId: segment.id,
    name: segment.name,
    destination: segment.destination,
    startDate: segment.startDate ? formatDateOnly(segment.startDate) : null,
    endDate: segment.endDate ? formatDateOnly(segment.endDate) : null,
    notes: segment.notes,
    fullTicketCount: segment.fullTicketCount,
    halfTicketCount: segment.halfTicketCount,
    studentTicketCount: segment.studentTicketCount,
    freeTicketCount: segment.freeTicketCount,
  }
}

export async function readSourceOrderGuestsEditSnapshot(
  tx: Prisma.TransactionClient,
  organizationId: string,
  departureId: string,
  sourceOrderId: string,
) {
  const order = await tx.sourceOrder.findFirst({
    where: { id: sourceOrderId, departureId, departure: { organizationId } },
    select: {
      id: true,
      displayName: true,
      guests: {
        orderBy: { id: 'asc' },
        select: { id: true, name: true, phone: true, gender: true, notes: true },
      },
    },
  })
  if (!order) throw new ConflictException('客源单不存在或不属于当前发团')
  return { sourceOrderId: order.id, displayName: order.displayName, guests: order.guests }
}

export async function readDepartureEditSnapshot(
  tx: Prisma.TransactionClient,
  organizationId: string,
  departureId: string,
  confirmationUnit: string,
  values: Record<string, unknown>,
) {
  if (confirmationUnit === ITINERARY_SEGMENT_UPDATE_CONFIRMATION_UNIT) {
    return readItinerarySegmentEditSnapshot(tx, organizationId, departureId, String(values.itinerarySegmentId))
  }
  const snapshot = await readSourceOrderGuestsEditSnapshot(tx, organizationId, departureId, String(values.sourceOrderId))
  const parsed = sourceOrderGuestChangesSchema.safeParse(values.guestChanges)
  if (!parsed.success) throw new BadRequestException('游客名单变更格式无效')
  const changes = parsed.data
  if (changes.update?.some((guest) => !snapshot.guests.some((existing) => existing.id === guest.guestId))) {
    throw new ConflictException('游客不存在或不属于当前客源单')
  }
  return snapshot
}
