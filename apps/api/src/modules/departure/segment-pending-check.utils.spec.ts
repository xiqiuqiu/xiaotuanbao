import { resolveSegmentPendingCheckForDisplay } from './segment-pending-check.utils'

describe('resolveSegmentPendingCheckForDisplay', () => {
  it('returns true when segment is pending even if all resources are cleared', () => {
    expect(
      resolveSegmentPendingCheckForDisplay({
        segmentPendingCheck: true,
        resources: [{ pendingCheck: false }],
      }),
    ).toBe(true)
  })

  it('returns true when any resource is still pending', () => {
    expect(
      resolveSegmentPendingCheckForDisplay({
        segmentPendingCheck: false,
        resources: [{ pendingCheck: false }, { pendingCheck: true }],
      }),
    ).toBe(true)
  })

  it('returns false when segment and all resources are cleared', () => {
    expect(
      resolveSegmentPendingCheckForDisplay({
        segmentPendingCheck: false,
        resources: [{ pendingCheck: false }],
      }),
    ).toBe(false)
  })
})
