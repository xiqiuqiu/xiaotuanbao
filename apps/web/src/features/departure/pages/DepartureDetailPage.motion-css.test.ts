import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('DepartureDetailPage tab pane motion CSS', () => {
  const css = readFileSync(resolve(__dirname, './DepartureDetailPage.module.css'), 'utf8')

  it('fades tab panes with opacity only under 120ms ease-out-quint', () => {
    expect(css).toContain('.tabPaneEnter')
    expect(css).toContain('tab-pane-fade 120ms')
    expect(css).toContain('var(--ant-motion-ease-out-quint, cubic-bezier(0.23, 1, 0.32, 1))')
    expect(css).toMatch(/@keyframes tab-pane-fade\s*\{[^}]*opacity:\s*0/)
    expect(css).not.toContain('translate')
    expect(css).not.toContain('scale')
  })

  it('keeps opacity fade under prefers-reduced-motion', () => {
    expect(css).toMatch(
      /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*\.tabPaneEnter\s*\{[\s\S]*tab-pane-fade 120ms/,
    )
    expect(css).not.toMatch(
      /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*\.tabPaneEnter\s*\{[\s\S]*animation:\s*none/,
    )
  })
})
