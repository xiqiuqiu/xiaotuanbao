import { describe, expect, it } from 'vitest'
import { DEMI_VIEWBOX } from './bot/repere'
import { resolveArcStrokeWidth } from './mascot-stroke'

describe('resolveArcStrokeWidth', () => {
  it('raises subpixel chat strokes to a ~1.5 CSS px floor at 56px', () => {
    const measuredOrbitWidth = 5.5
    const at56 = resolveArcStrokeWidth(measuredOrbitWidth, 56)
    expect(at56).toBeCloseTo((1.5 * 2 * DEMI_VIEWBOX) / 56, 5)
    expect(at56).toBeGreaterThan(measuredOrbitWidth)
  })

  it('does not thicken editor-scale frames when measured width already exceeds the floor', () => {
    const measuredOrbitWidth = 5.5
    const at200 = resolveArcStrokeWidth(measuredOrbitWidth, 200)
    expect(at200).toBe(measuredOrbitWidth)
    expect((1.5 * 2 * DEMI_VIEWBOX) / 200).toBeLessThan(measuredOrbitWidth)
  })
})
