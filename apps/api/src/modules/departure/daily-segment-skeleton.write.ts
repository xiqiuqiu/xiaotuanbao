import type { Prisma } from '@prisma/client'
import { formatDateOnly, parseDateOnly } from './departure-date.utils'
import {
  enumerateDateOnlyDays,
  uncoveredTourDaysForSegments,
} from './daily-segment-skeleton.utils'

/** Fill uncovered calendar days as one-day segments; then normalize sortOrder. */
export async function fillMissingDailySkeletonInTx(
  tx: Prisma.TransactionClient,
  departureId: string,
  startDate: Date,
  endDate: Date,
): Promise<{ dayCount: number; createdCount: number }> {
  const existing = await tx.itinerarySegment.findMany({
    where: { departureId },
    select: { startDate: true, endDate: true },
  })

  const days = enumerateDateOnlyDays(startDate, endDate)
  const missingDays = uncoveredTourDaysForSegments(startDate, endDate, existing)

  if (missingDays.length > 0) {
    await tx.itinerarySegment.createMany({
      data: missingDays.map((day) => {
        const dayIndex = days.indexOf(day)
        return {
          departureId,
          name: `第${dayIndex + 1}天`,
          startDate: parseDateOnly(day),
          endDate: parseDateOnly(day),
          dayCount: 1,
          sortOrder: dayIndex,
          destination: null,
          notes: null,
        }
      }),
    })
  }

  await normalizeSegmentSortOrderInTx(tx, departureId)

  return { dayCount: days.length, createdCount: missingDays.length }
}

export async function normalizeSegmentSortOrderInTx(
  tx: Prisma.TransactionClient,
  departureId: string,
): Promise<void> {
  const all = await tx.itinerarySegment.findMany({
    where: { departureId },
    select: { id: true, startDate: true, sortOrder: true },
  })

  const sorted = [...all].sort((left, right) => {
    if (!left.startDate && !right.startDate) {
      return left.sortOrder - right.sortOrder
    }
    if (!left.startDate) {
      return 1
    }
    if (!right.startDate) {
      return -1
    }
    const byDate = formatDateOnly(left.startDate).localeCompare(formatDateOnly(right.startDate))
    if (byDate !== 0) {
      return byDate
    }
    return left.sortOrder - right.sortOrder
  })

  for (let index = 0; index < sorted.length; index += 1) {
    const segment = sorted[index]!
    if (segment.sortOrder !== index) {
      await tx.itinerarySegment.update({
        where: { id: segment.id },
        data: { sortOrder: index },
      })
    }
  }
}
