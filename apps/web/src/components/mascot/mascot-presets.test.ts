import { describe, expect, it } from 'vitest'
import { totalDuration } from './bot/cycles'
import {
  MASCOT_PRESET_RESOLUTION,
  resolveMascotPlayback,
  type MascotPreset,
} from './mascot-presets'

describe('resolveMascotPlayback', () => {
  it('maps presets to measured states / cycles', () => {
    expect(MASCOT_PRESET_RESOLUTION.idle).toEqual({ state: 'idle' })
    expect(MASCOT_PRESET_RESOLUTION.thinking).toEqual({ state: 'thinking' })
    expect(MASCOT_PRESET_RESOLUTION.working).toEqual({
      cycle: ['play', 'orbit', 'burst', 'comet'],
    })
    expect(MASCOT_PRESET_RESOLUTION.success).toEqual({ state: 'notify' })
    expect(MASCOT_PRESET_RESOLUTION.error).toEqual({ state: 'alert' })
    expect(MASCOT_PRESET_RESOLUTION.sleep).toEqual({ state: 'sleep' })
  })

  it('uses measured block durations for the working cycle (~10.4s)', () => {
    const { blocks, initialState } = resolveMascotPlayback({ preset: 'working' })
    expect(initialState).toBe('play')
    expect(blocks.map((b) => b.state)).toEqual(['play', 'orbit', 'burst', 'comet'])
    expect(totalDuration(blocks)).toBeCloseTo(10.4, 5)
  })

  it('prefers cycle over preset over state over idle', () => {
    expect(
      resolveMascotPlayback({
        cycle: ['wink', 'wide'],
        preset: 'thinking',
        state: 'alert',
      }).blocks.map((b) => b.state),
    ).toEqual(['wink', 'wide'])

    expect(
      resolveMascotPlayback({
        preset: 'error',
        state: 'sleep',
      }).initialState,
    ).toBe('alert')

    expect(resolveMascotPlayback({ state: 'hexagon' }).initialState).toBe('hexagon')
    expect(resolveMascotPlayback({}).initialState).toBe('idle')
  })

  it('documents success as measured notify (not wink)', () => {
    const preset: MascotPreset = 'success'
    expect(resolveMascotPlayback({ preset }).initialState).toBe('notify')
  })
})
