import { DEMI_VIEWBOX } from './bot/repere'

/** Target minimum stroke thickness in CSS pixels for chat-scale arcs. */
const ARC_STROKE_CSS_FLOOR = 1.5

/**
 * Boost thin arc strokes at small CSS sizes so rings stay ≥ ~1.5 CSS px.
 * At editor scale (~200px) the floor sits below measured widths and does not thicken.
 */
export function resolveArcStrokeWidth(arcWidth: number, displaySize: number): number {
  if (displaySize <= 0) return arcWidth
  const floorInViewBoxUnits = (ARC_STROKE_CSS_FLOOR * 2 * DEMI_VIEWBOX) / displaySize
  return Math.max(arcWidth, floorInViewBoxUnits)
}
