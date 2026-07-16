import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('global.css reduced-motion', () => {
  const css = readFileSync(resolve(__dirname, '../styles/global.css'), 'utf8')

  it('does not nuke all animations under prefers-reduced-motion', () => {
    expect(css).not.toContain('animation-duration: 0.01ms')
    expect(css).not.toContain('animation-iteration-count: 1 !important')
  })

  it('keeps scroll-behavior auto and suppresses button press transform', () => {
    expect(css).toMatch(
      /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*scroll-behavior:\s*auto/,
    )
    expect(css).toMatch(
      /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*\.ant-btn:active:not\(:disabled\)\s*\{[\s\S]*transform:\s*none/,
    )
  })
})
