import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('DepartureDetailPage tab pane motion CSS', () => {
  const css = readFileSync(resolve(__dirname, './DepartureDetailPage.module.css'), 'utf8')

  it('fades tab panes with opacity only under 120ms', () => {
    expect(css).toMatch(/\.tabPaneEnter\s*\{[^}]*animation:\s*tab-pane-fade 120ms ease both/)
    expect(css).toMatch(/@keyframes tab-pane-fade\s*\{[^}]*opacity:\s*0/)
    expect(css).not.toContain('translate')
    expect(css).not.toContain('scale')
  })

  it('disables tab pane fade under prefers-reduced-motion', () => {
    expect(css).toMatch(
      /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*\.tabPaneEnter\s*\{[\s\S]*animation:\s*none/,
    )
  })
})
