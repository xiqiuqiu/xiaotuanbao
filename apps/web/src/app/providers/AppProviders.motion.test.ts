import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('AppProviders motion duration locks', () => {
  const source = readFileSync(resolve(__dirname, './AppProviders.tsx'), 'utf8')

  it('locks DESIGN.md Elevation motion durations on the theme token', () => {
    expect(source).toContain("motionDurationFast: '0.1s'")
    expect(source).toContain("motionDurationMid: '0.2s'")
    expect(source).toContain("motionDurationSlow: '0.3s'")
    expect(source).toContain("motionEaseOutQuint: 'cubic-bezier(0.23, 1, 0.32, 1)'")
    expect(source).not.toMatch(/motion:\s*false/)
  })
})
