export interface TicketTypeHeadcountValues {
  fullTicketCount: number
  halfTicketCount: number
  studentTicketCount: number
  freeTicketCount: number
}

export function sumTicketTypeHeadcount(counts: TicketTypeHeadcountValues): number {
  return (
    (counts.fullTicketCount || 0) +
    (counts.halfTicketCount || 0) +
    (counts.studentTicketCount || 0) +
    (counts.freeTicketCount || 0)
  )
}

/** Soft check against departure source-order guest total (adult + child). */
export function hasTicketHeadcountMismatch(
  counts: TicketTypeHeadcountValues,
  sourceGuestTotal: number,
): boolean {
  return sumTicketTypeHeadcount(counts) !== sourceGuestTotal
}

export function formatTicketHeadcountMismatchMessage(
  counts: TicketTypeHeadcountValues,
  sourceGuestTotal: number,
): string {
  const ticketTotal = sumTicketTypeHeadcount(counts)
  return `票型人数合计（${ticketTotal}）与本团客源人数（${sourceGuestTotal}）不一致，请核对。仍可保存。`
}
