type SegmentRef = { id: string; startDate?: string }

function sortSegmentsByStartDate<T extends SegmentRef>(
  segments: ReadonlyArray<T>,
): T[] {
  return [...segments].sort((a, b) => {
    const left = a.startDate ?? ''
    const right = b.startDate ?? ''
    return left.localeCompare(right)
  })
}

/** Resolve the selected itinerary segment for the execution arrangement URL.
 * Segments are ordered by startDate ascending; first item is the default.
 */
export function resolveSelectedSegmentId(
  segments: ReadonlyArray<SegmentRef>,
  segmentId: string | undefined,
): string | undefined {
  if (segments.length === 0) {
    return undefined
  }

  const ordered = sortSegmentsByStartDate(segments)

  if (segmentId && ordered.some((segment) => segment.id === segmentId)) {
    return segmentId
  }

  return ordered[0]?.id
}

/** After deleting a segment, pick the next neighbor by startDate order;
 * otherwise the previous; otherwise undefined (empty state).
 */
export function resolveAdjacentSegmentId(
  segments: ReadonlyArray<SegmentRef>,
  deletedSegmentId: string,
): string | undefined {
  const ordered = sortSegmentsByStartDate(segments)
  const index = ordered.findIndex((segment) => segment.id === deletedSegmentId)

  if (index < 0) {
    return ordered[0]?.id
  }

  const remaining = ordered.filter((segment) => segment.id !== deletedSegmentId)
  if (remaining.length === 0) {
    return undefined
  }

  return remaining[index]?.id ?? remaining[index - 1]?.id
}
