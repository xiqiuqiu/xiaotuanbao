/** Resolve the selected itinerary segment for the execution arrangement URL.
 * Segments are ordered by startDate ascending; first item is the default.
 */
export function resolveSelectedSegmentId(
  segments: ReadonlyArray<{ id: string; startDate?: string }>,
  segmentId: string | undefined,
): string | undefined {
  if (segments.length === 0) {
    return undefined
  }

  const ordered = [...segments].sort((a, b) => {
    const left = a.startDate ?? ''
    const right = b.startDate ?? ''
    return left.localeCompare(right)
  })

  if (segmentId && ordered.some((segment) => segment.id === segmentId)) {
    return segmentId
  }

  return ordered[0]?.id
}
