type SegmentRef = { id: string; sortOrder?: number }

function sortSegmentsBySortOrder<T extends SegmentRef>(
  segments: ReadonlyArray<T>,
): T[] {
  return [...segments].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
}

/** Resolve the selected itinerary segment for the execution arrangement URL.
 * Segments are ordered by sortOrder ascending; first item is the default.
 */
export function resolveSelectedSegmentId(
  segments: ReadonlyArray<SegmentRef>,
  segmentId: string | undefined,
): string | undefined {
  if (segments.length === 0) {
    return undefined
  }

  const ordered = sortSegmentsBySortOrder(segments)

  if (segmentId && ordered.some((segment) => segment.id === segmentId)) {
    return segmentId
  }

  return ordered[0]?.id
}

/** After deleting a segment, pick the next neighbor by sortOrder;
 * otherwise the previous; otherwise undefined (empty state).
 */
export function resolveAdjacentSegmentId(
  segments: ReadonlyArray<SegmentRef>,
  deletedSegmentId: string,
): string | undefined {
  const ordered = sortSegmentsBySortOrder(segments)
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
