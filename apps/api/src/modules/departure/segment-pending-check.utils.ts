/** 日程卡「待检查」：段本身或任一资源仍待核对（#243 PRD story 12）。 */
export function resolveSegmentPendingCheckForDisplay(input: {
  segmentPendingCheck: boolean
  resources: ReadonlyArray<{ pendingCheck: boolean }>
}): boolean {
  return (
    input.segmentPendingCheck || input.resources.some((resource) => resource.pendingCheck)
  )
}
