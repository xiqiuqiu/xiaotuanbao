export interface TicketTypeHeadcount {
  fullTicketCount: number
  halfTicketCount: number
  studentTicketCount: number
  freeTicketCount: number
}

export function sumTicketTypeHeadcount(counts: TicketTypeHeadcount): number {
  return (
    counts.fullTicketCount +
    counts.halfTicketCount +
    counts.studentTicketCount +
    counts.freeTicketCount
  )
}

/** Soft check: ticket sum vs departure source-order guest total (adult + child). */
export function hasTicketHeadcountMismatch(
  counts: TicketTypeHeadcount,
  sourceGuestTotal: number,
): boolean {
  return sumTicketTypeHeadcount(counts) !== sourceGuestTotal
}
