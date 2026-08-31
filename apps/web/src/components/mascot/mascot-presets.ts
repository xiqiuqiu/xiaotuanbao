import { makeBlock, type Block } from './bot/cycles'
import type { StateId } from './bot/states'
import { SEQUENCE } from './bot/states'

/** The 14 measured SEQUENCE state ids (excludes interface-only `swirl`). */
export type MascotStateId = (typeof SEQUENCE)[number]

export type MascotPreset = 'idle' | 'thinking' | 'working' | 'success' | 'error' | 'sleep'

/**
 * Product presets → measured bloub states / cycles.
 *
 * Parent drives these; this module only maps names to SEQUENCE ids and
 * measured block durations (`makeBlock`). No internal product FSM.
 *
 * - idle → hold `idle` (gaze + blink)
 * - thinking → hold `thinking` (3-dot pulse)
 * - working → cycle `play` → `orbit` → `burst` → `comet` (~10.4s measured)
 * - success → hold `notify` (blue badge pop; measured notify state)
 * - error → hold `alert`
 * - sleep → hold `sleep`
 */
export const MASCOT_PRESET_RESOLUTION: Record<
  MascotPreset,
  { state?: MascotStateId; cycle?: MascotStateId[] }
> = {
  idle: { state: 'idle' },
  thinking: { state: 'thinking' },
  working: { cycle: ['play', 'orbit', 'burst', 'comet'] },
  success: { state: 'notify' },
  error: { state: 'alert' },
  sleep: { state: 'sleep' },
}

export function isMascotStateId(value: string): value is MascotStateId {
  return (SEQUENCE as readonly string[]).includes(value)
}

/**
 * Resolve playback plan. Precedence: `cycle` > `preset` > `state` > idle.
 */
export function resolveMascotPlayback(input: {
  cycle?: MascotStateId[]
  preset?: MascotPreset
  state?: MascotStateId
}): { blocks: Block[]; initialState: MascotStateId } {
  if (input.cycle && input.cycle.length > 0) {
    const blocks = input.cycle.map((id) => makeBlock(id))
    return { blocks, initialState: input.cycle[0]! }
  }

  if (input.preset) {
    const mapped = MASCOT_PRESET_RESOLUTION[input.preset]
    if (mapped.cycle && mapped.cycle.length > 0) {
      const blocks = mapped.cycle.map((id) => makeBlock(id))
      return { blocks, initialState: mapped.cycle[0]! }
    }
    const state = mapped.state ?? 'idle'
    return { blocks: [makeBlock(state)], initialState: state }
  }

  const state = input.state ?? 'idle'
  return { blocks: [makeBlock(state)], initialState: state }
}

/** Type guard helper for callers that hold a StateId including swirl. */
export function asMascotStateId(id: StateId): MascotStateId | null {
  return isMascotStateId(id) ? id : null
}
